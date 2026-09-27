import type { DotaRole } from "@prisma/client";

export interface BalancePlayer {
  id: string;
  name: string;
  finalRating: number;
  primaryRole?: DotaRole | null;
  /** Вторичные роли по приоритету (0 — высший) */
  secondaryRoles?: DotaRole[];
}

export interface AssignedPlayer extends BalancePlayer {
  position: number;
}

export interface BalancedTeams {
  radiant: AssignedPlayer[];
  dire: AssignedPlayer[];
  radiantTotal: number;
  direTotal: number;
  difference: number;
}

function teamTotals(radiant: BalancePlayer[], dire: BalancePlayer[]) {
  const radiantTotal = radiant.reduce((s, p) => s + p.finalRating, 0);
  const direTotal = dire.reduce((s, p) => s + p.finalRating, 0);
  return { radiantTotal, direTotal, difference: Math.abs(radiantTotal - direTotal) };
}

const CORE_POSITION: Partial<Record<DotaRole, number>> = {
  CARRY: 1,
  MID: 2,
  OFFLANE: 3,
};

const SUPPORT_ROLES: DotaRole[] = ["SUPPORT", "HARD_SUPPORT"];

function preferredPositions(player: BalancePlayer): number[] {
  const roles: DotaRole[] = [];
  if (player.primaryRole) roles.push(player.primaryRole);
  for (const r of player.secondaryRoles ?? []) {
    if (!roles.includes(r)) roles.push(r);
  }

  const positions: number[] = [];
  for (const role of roles) {
    const core = CORE_POSITION[role];
    if (core && !positions.includes(core)) positions.push(core);
  }
  const wantsSupport = roles.some((r) => SUPPORT_ROLES.includes(r));
  if (wantsSupport) {
    // Хард-саппорт в приоритете на 5, обычный — на 4
    const hardFirst = roles.includes("HARD_SUPPORT");
    const supportOrder = hardFirst ? [5, 4] : [4, 5];
    for (const s of supportOrder) {
      if (!positions.includes(s)) positions.push(s);
    }
  }
  return positions;
}

function assignPositions(team: BalancePlayer[]): AssignedPlayer[] {
  const taken = new Set<number>();
  const assigned = new Map<string, number>();

  // Раунды по приоритету ролей: сначала primary у всех, потом secondary #1, #2, #3
  const maxDepth = 1 + Math.max(0, ...team.map((p) => p.secondaryRoles?.length ?? 0));

  for (let depth = 0; depth < maxDepth; depth++) {
    for (const p of team) {
      if (assigned.has(p.id)) continue;
      const roles: DotaRole[] = [];
      if (depth === 0 && p.primaryRole) roles.push(p.primaryRole);
      if (depth > 0) {
        const sec = p.secondaryRoles?.[depth - 1];
        if (sec) roles.push(sec);
      }
      for (const role of roles) {
        const core = CORE_POSITION[role];
        if (core && !taken.has(core)) {
          taken.add(core);
          assigned.set(p.id, core);
          break;
        }
        if (SUPPORT_ROLES.includes(role)) {
          const slots = (role === "HARD_SUPPORT" ? [5, 4] : [4, 5]).filter((s) => !taken.has(s));
          const slot = slots[0];
          if (slot) {
            taken.add(slot);
            assigned.set(p.id, slot);
            break;
          }
        }
      }
    }
  }

  // Запасной проход по объединённым предпочтениям
  for (const p of team) {
    if (assigned.has(p.id)) continue;
    for (const pos of preferredPositions(p)) {
      if (!taken.has(pos)) {
        taken.add(pos);
        assigned.set(p.id, pos);
        break;
      }
    }
  }

  const freeSlots = [1, 2, 3, 4, 5].filter((s) => !taken.has(s));
  for (const p of team) {
    if (!assigned.has(p.id)) {
      const slot = freeSlots.shift();
      if (slot) assigned.set(p.id, slot);
    }
  }

  return team
    .map((p) => ({ ...p, position: assigned.get(p.id) ?? 0 }))
    .sort((a, b) => a.position - b.position);
}

function bestSubsetBalance(players: BalancePlayer[]): { radiant: BalancePlayer[]; dire: BalancePlayer[] } {
  const n = players.length;
  const half = n / 2;
  let best: { radiant: BalancePlayer[]; dire: BalancePlayer[]; difference: number } | null = null;

  const sorted = [...players].sort((a, b) => b.finalRating - a.finalRating);

  function search(index: number, radiant: BalancePlayer[], dire: BalancePlayer[]) {
    if (index === n) {
      if (radiant.length !== half || dire.length !== half) return;
      const { difference } = teamTotals(radiant, dire);
      if (!best || difference < best.difference) {
        best = { radiant: [...radiant], dire: [...dire], difference };
      }
      return;
    }
    if (radiant.length < half) {
      radiant.push(sorted[index]);
      search(index + 1, radiant, dire);
      radiant.pop();
    }
    if (dire.length < half) {
      dire.push(sorted[index]);
      search(index + 1, radiant, dire);
      dire.pop();
    }
  }

  search(0, [], []);
  return best ?? { radiant: sorted.slice(0, half), dire: sorted.slice(half) };
}

export function balanceTeams(players: BalancePlayer[]): BalancedTeams {
  if (players.length !== 10) {
    throw new Error("Для автобаланса нужно ровно 10 игроков");
  }
  const { radiant, dire } = bestSubsetBalance(players);
  const totals = teamTotals(radiant, dire);
  return {
    radiant: assignPositions(radiant),
    dire: assignPositions(dire),
    ...totals,
  };
}

type SideMap = Record<string, { team: "RADIANT" | "DIRE"; position: number }>;

/**
 * Состав на 2-ю игру: минимальный свап (2–4 игрока) между командами,
 * по возможности на той же позиции, с близким балансом силы.
 */
export function reshuffleForSecondGame(
  players: BalancePlayer[],
  game1Assignments: SideMap
): BalancedTeams {
  if (players.length !== 10) {
    throw new Error("Нужно 10 игроков");
  }
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));

  type Slot = { userId: string; position: number; rating: number };
  const radiantSlots: Slot[] = [];
  const direSlots: Slot[] = [];
  for (const [userId, a] of Object.entries(game1Assignments)) {
    const p = byId[userId];
    if (!p) continue;
    const slot = { userId, position: a.position, rating: p.finalRating };
    if (a.team === "RADIANT") radiantSlots.push(slot);
    else direSlots.push(slot);
  }
  if (radiantSlots.length !== 5 || direSlots.length !== 5) {
    return balanceTeams(players);
  }

  const powerDiff = (r: Slot[], d: Slot[]) =>
    Math.abs(
      r.reduce((s, x) => s + x.rating, 0) - d.reduce((s, x) => s + x.rating, 0)
    );

  const baseDiff = powerDiff(radiantSlots, direSlots);
  type Cand = { r: Slot[]; d: Slot[]; swapped: number; diff: number };
  let best: Cand | null = null;

  // Один свап на одной позиции (2 игрока)
  for (const pos of [1, 2, 3, 4, 5]) {
    const ri = radiantSlots.findIndex((s) => s.position === pos);
    const di = direSlots.findIndex((s) => s.position === pos);
    if (ri < 0 || di < 0) continue;
    const r = radiantSlots.map((s) => ({ ...s }));
    const d = direSlots.map((s) => ({ ...s }));
    const tmp = r[ri];
    r[ri] = { ...d[di], position: pos };
    d[di] = { ...tmp, position: pos };
    const cand: Cand = { r, d, swapped: 2, diff: powerDiff(r, d) };
    if (
      !best ||
      cand.diff < best.diff ||
      (cand.diff === best.diff && cand.swapped < best.swapped)
    ) {
      best = cand;
    }
  }

  // Два свапа на разных позициях (4 игрока) — если один свап ухудшил баланс сильнее +8
  if (!best || best.diff > baseDiff + 8) {
    for (let p1 = 1; p1 <= 5; p1++) {
      for (let p2 = p1 + 1; p2 <= 5; p2++) {
        const r = radiantSlots.map((s) => ({ ...s }));
        const d = direSlots.map((s) => ({ ...s }));
        for (const pos of [p1, p2]) {
          const ri = r.findIndex((s) => s.position === pos);
          const di = d.findIndex((s) => s.position === pos);
          if (ri < 0 || di < 0) continue;
          const tmp = r[ri];
          r[ri] = { ...d[di], position: pos };
          d[di] = { ...tmp, position: pos };
        }
        const cand: Cand = { r, d, swapped: 4, diff: powerDiff(r, d) };
        if (
          !best ||
          cand.diff < best.diff ||
          (cand.diff === best.diff && cand.swapped < best.swapped)
        ) {
          best = cand;
        }
      }
    }
  }

  if (!best) return balanceTeams(players);

  const radiant = best.r
    .map((s) => ({ ...byId[s.userId], position: s.position }))
    .sort((a, b) => a.position - b.position);
  const dire = best.d
    .map((s) => ({ ...byId[s.userId], position: s.position }))
    .sort((a, b) => a.position - b.position);
  const totals = teamTotals(radiant, dire);
  return { radiant, dire, ...totals };
}
