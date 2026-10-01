import type { DotaRole } from "@prisma/client";
import { DOTA_ROLE_POSITION } from "@/lib/labels";

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

function playerRoles(player: BalancePlayer): DotaRole[] {
  const roles: DotaRole[] = [];
  if (player.primaryRole) roles.push(player.primaryRole);
  for (const r of player.secondaryRoles ?? []) {
    if (!roles.includes(r)) roles.push(r);
  }
  return roles;
}

/**
 * Гибкие предпочтения для обычного баланса:
 * SUPPORT может на 4 или 5 (и наоборот для HARD_SUPPORT).
 */
function preferredPositions(player: BalancePlayer): number[] {
  const roles = playerRoles(player);
  const positions: number[] = [];
  for (const role of roles) {
    const core = CORE_POSITION[role];
    if (core && !positions.includes(core)) positions.push(core);
  }
  const wantsSupport = roles.some((r) => SUPPORT_ROLES.includes(r));
  if (wantsSupport) {
    const hardFirst = roles.includes("HARD_SUPPORT");
    const supportOrder = hardFirst ? [5, 4] : [4, 5];
    for (const s of supportOrder) {
      if (!positions.includes(s)) positions.push(s);
    }
  }
  return positions;
}

/**
 * Строгие позиции только по указанным ролям (1↔CARRY … 5↔HARD_SUPPORT).
 * SUPPORT ≠ 5, HARD_SUPPORT ≠ 4.
 */
function strictListedPositions(player: BalancePlayer): number[] {
  const positions: number[] = [];
  for (const role of playerRoles(player)) {
    const pos = DOTA_ROLE_POSITION[role];
    if (pos && !positions.includes(pos)) positions.push(pos);
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

/**
 * Назначение позиций только на строго указанные роли.
 * Если конфликт — игроки без подходящего слота уходят в оставшиеся (для фоллбека).
 */
function assignPositionsStrict(team: BalancePlayer[]): AssignedPlayer[] {
  const taken = new Set<number>();
  const assigned = new Map<string, number>();
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
        const pos = DOTA_ROLE_POSITION[role];
        if (pos && !taken.has(pos)) {
          taken.add(pos);
          assigned.set(p.id, pos);
          break;
        }
      }
    }
  }

  for (const p of team) {
    if (assigned.has(p.id)) continue;
    for (const pos of strictListedPositions(p)) {
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

/** 1 — мягко (мало свапов), 5 — сильно (больше перестановок, но с лимитом разницы силы) */
export type ReshuffleIntensity = 1 | 2 | 3 | 4 | 5;

export const RESHUFFLE_INTENSITY_LABELS: Record<ReshuffleIntensity, string> = {
  1: "Мягко",
  2: "Слабо",
  3: "Средне",
  4: "Сильнее",
  5: "Сильно",
};

/** Полный ключ состава: команда + позиция у каждого игрока */
function fullAssignmentKey(map: SideMap): string {
  return Object.entries(map)
    .map(([id, a]) => `${id}:${a.team}:${a.position}`)
    .sort()
    .join("|");
}

function slotsToSideMap(
  r: { userId: string; position: number }[],
  d: { userId: string; position: number }[]
): SideMap {
  const map: SideMap = {};
  for (const s of r) map[s.userId] = { team: "RADIANT", position: s.position };
  for (const s of d) map[s.userId] = { team: "DIRE", position: s.position };
  return map;
}

function clampIntensity(n: unknown): ReshuffleIntensity {
  const v = Math.round(Number(n) || 3);
  if (v <= 1) return 1;
  if (v >= 5) return 5;
  return v as ReshuffleIntensity;
}

/** Сколько «движения» хотим и какой запас по разнице силы допускаем */
function intensityParams(intensity: ReshuffleIntensity) {
  switch (intensity) {
    case 1:
      return {
        minTeamSwitches: 2,
        maxTeamSwitches: 4,
        preferSamePos: true,
        allowCrossPos: false,
        reassignRoles: false,
        maxDiffSlack: 5,
        poolSize: 5,
      };
    case 2:
      return {
        minTeamSwitches: 2,
        maxTeamSwitches: 6,
        preferSamePos: true,
        allowCrossPos: false,
        reassignRoles: true,
        maxDiffSlack: 7,
        poolSize: 6,
      };
    case 3:
      return {
        minTeamSwitches: 4,
        maxTeamSwitches: 8,
        preferSamePos: true,
        allowCrossPos: true,
        reassignRoles: true,
        maxDiffSlack: 9,
        poolSize: 7,
      };
    case 4:
      return {
        minTeamSwitches: 4,
        maxTeamSwitches: 10,
        preferSamePos: false,
        allowCrossPos: true,
        reassignRoles: true,
        maxDiffSlack: 13,
        poolSize: 8,
      };
    case 5:
      return {
        minTeamSwitches: 6,
        maxTeamSwitches: 10,
        preferSamePos: false,
        allowCrossPos: true,
        reassignRoles: true,
        maxDiffSlack: 18,
        poolSize: 8,
      };
  }
}

function pickRandomWeighted<T extends { score: number }>(pool: T[]): T {
  if (pool.length === 1) return pool[0];
  const min = Math.min(...pool.map((c) => c.score));
  const weights = pool.map((c) => Math.max(1, c.score - min + 4));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Состав на 2-ю игру с учётом силы пересборки.
 * Каждый вызов почти всегда даёт другой вариант: среди 3–8 лучших
 * кандидатов уровня intensity выбирается случайный (не равный avoid).
 * onlyListedRoles — не ставить на позицию вне primary/secondary ролей игрока.
 */
export function reshuffleForSecondGame(
  players: BalancePlayer[],
  game1Assignments: SideMap,
  avoid?: SideMap | null,
  intensityRaw: number = 3,
  onlyListedRoles: boolean = false
): BalancedTeams {
  if (players.length !== 10) {
    throw new Error("Нужно 10 игроков");
  }
  const intensity = clampIntensity(intensityRaw);
  const params = intensityParams(intensity);
  const forceRoleFit = onlyListedRoles || params.reassignRoles;
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

  const baseDiff = Math.abs(
    radiantSlots.reduce((s, x) => s + x.rating, 0) -
      direSlots.reduce((s, x) => s + x.rating, 0)
  );
  const g1Pos = new Map(
    Object.entries(game1Assignments).map(([id, a]) => [id, a.position] as const)
  );
  const g1Team = new Map(
    Object.entries(game1Assignments).map(([id, a]) => [id, a.team] as const)
  );

  function listedPositions(p: BalancePlayer): number[] {
    // При галочке — строго 1 роль = 1 позиция; без неё — гибкий саппорт 4/5
    return onlyListedRoles ? strictListedPositions(p) : preferredPositions(p);
  }

  /** true, если позиция допустима (роли не указаны → любая ок) */
  function isListedRole(p: BalancePlayer, position: number): boolean {
    const pref = listedPositions(p);
    if (pref.length === 0) return true;
    return pref.includes(position);
  }

  const powerDiff = (r: Slot[], d: Slot[]) =>
    Math.abs(
      r.reduce((s, x) => s + x.rating, 0) - d.reduce((s, x) => s + x.rating, 0)
    );

  function applySamePosSwaps(
    positions: number[],
    baseR = radiantSlots,
    baseD = direSlots
  ): { r: Slot[]; d: Slot[] } {
    const r = baseR.map((s) => ({ ...s }));
    const d = baseD.map((s) => ({ ...s }));
    for (const pos of positions) {
      const ri = r.findIndex((s) => s.position === pos);
      const di = d.findIndex((s) => s.position === pos);
      if (ri < 0 || di < 0) continue;
      const tmp = r[ri];
      r[ri] = { ...d[di], position: pos };
      d[di] = { ...tmp, position: pos };
    }
    return { r, d };
  }

  function applyCrossSwap(
    rPos: number,
    dPos: number,
    baseR = radiantSlots,
    baseD = direSlots
  ): { r: Slot[]; d: Slot[] } | null {
    const r = baseR.map((s) => ({ ...s }));
    const d = baseD.map((s) => ({ ...s }));
    const ri = r.findIndex((s) => s.position === rPos);
    const di = d.findIndex((s) => s.position === dPos);
    if (ri < 0 || di < 0) return null;
    const fromR = r[ri];
    const fromD = d[di];
    r[ri] = { ...fromD, position: rPos };
    d[di] = { ...fromR, position: dPos };
    return { r, d };
  }

  /** Внутри команды поменять две позиции — даёт разные раскладки без смены силы */
  function withinTeamPosSwaps(r: Slot[], d: Slot[]): { r: Slot[]; d: Slot[] }[] {
    const out: { r: Slot[]; d: Slot[] }[] = [];
    const swapSide = (side: Slot[], which: "r" | "d") => {
      for (let i = 0; i < side.length; i++) {
        for (let j = i + 1; j < side.length; j++) {
          const copy = side.map((s) => ({ ...s }));
          const pi = copy[i].position;
          const pj = copy[j].position;
          copy[i] = { ...copy[j], position: pi };
          copy[j] = { ...side[i], position: pj };
          if (which === "r") out.push({ r: copy, d: d.map((s) => ({ ...s })) });
          else out.push({ r: r.map((s) => ({ ...s })), d: copy });
        }
      }
    };
    swapSide(r, "r");
    swapSide(d, "d");
    return out;
  }

  function reassignRoles(r: Slot[], d: Slot[]): { r: Slot[]; d: Slot[] } {
    const radiantPlayers = r.map((s) => byId[s.userId]).filter(Boolean);
    const direPlayers = d.map((s) => byId[s.userId]).filter(Boolean);
    const assign = onlyListedRoles ? assignPositionsStrict : assignPositions;
    const rAssigned = assign(radiantPlayers);
    const dAssigned = assign(direPlayers);
    return {
      r: rAssigned.map((p) => ({
        userId: p.id,
        position: p.position,
        rating: p.finalRating,
      })),
      d: dAssigned.map((p) => ({
        userId: p.id,
        position: p.position,
        rating: p.finalRating,
      })),
    };
  }

  type Cand = {
    r: Slot[];
    d: Slot[];
    score: number;
    diff: number;
    switches: number;
    posChanges: number;
    offRole: number;
    key: string;
  };

  function scoreCandidate(r: Slot[], d: Slot[]): Cand {
    const diff = powerDiff(r, d);
    const all = [...r, ...d];
    let teamSwitches = 0;
    let positionChanges = 0;
    let roleFit = 0;
    let offRole = 0;
    for (const s of all) {
      const wasTeam = g1Team.get(s.userId);
      const wasPos = g1Pos.get(s.userId);
      const nowTeam = r.some((x) => x.userId === s.userId) ? "RADIANT" : "DIRE";
      if (wasTeam && wasTeam !== nowTeam) teamSwitches += 1;
      if (wasPos && wasPos !== s.position) positionChanges += 1;
      const p = byId[s.userId];
      if (p) {
        const pref = listedPositions(p);
        if (pref.length === 0) {
          // ролей нет — не штрафуем
        } else if (pref[0] === s.position) {
          roleFit += 3;
        } else if (pref.includes(s.position)) {
          roleFit += 1;
        } else {
          offRole += 1;
        }
      }
    }

    const slack = Math.max(0, diff - baseDiff);
    const overSlack = Math.max(0, slack - params.maxDiffSlack);
    const underChange = Math.max(0, params.minTeamSwitches - teamSwitches) * 18;
    const overChange = Math.max(0, teamSwitches - params.maxTeamSwitches) * 10;
    const change =
      teamSwitches * 10 +
      positionChanges * (params.preferSamePos ? 3 : 7) +
      Math.min(teamSwitches, params.minTeamSwitches) * 5;
    const score =
      change +
      roleFit -
      underChange -
      overChange -
      slack * 7 -
      overSlack * 45 -
      Math.max(0, diff - 15) * 3 -
      (onlyListedRoles ? offRole * 80 : offRole * 8);

    return {
      r,
      d,
      score,
      diff,
      switches: teamSwitches,
      posChanges: positionChanges,
      offRole,
      key: fullAssignmentKey(slotsToSideMap(r, d)),
    };
  }

  const raw: { r: Slot[]; d: Slot[] }[] = [];
  const positions = [1, 2, 3, 4, 5];

  function addCombos(kMin: number, kMax: number) {
    for (let k = kMin; k <= kMax; k++) {
      const combos: number[][] = [];
      const walk = (start: number, acc: number[]) => {
        if (acc.length === k) {
          combos.push([...acc]);
          return;
        }
        for (let i = start; i < positions.length; i++) {
          acc.push(positions[i]);
          walk(i + 1, acc);
          acc.pop();
        }
      };
      walk(0, []);
      for (const combo of combos) raw.push(applySamePosSwaps(combo));
    }
  }

  // База: same-pos свапы под уровень
  if (intensity === 1) addCombos(1, 2);
  else if (intensity === 2) addCombos(1, 2);
  else if (intensity === 3) addCombos(1, 3);
  else addCombos(2, 3);

  // Кросс-позиции
  if (params.allowCrossPos) {
    for (let rp = 1; rp <= 5; rp++) {
      for (let dp = 1; dp <= 5; dp++) {
        const one = applyCrossSwap(rp, dp);
        if (one) raw.push(one);
        if (intensity >= 4) {
          for (let rp2 = rp + 1; rp2 <= 5; rp2++) {
            for (let dp2 = 1; dp2 <= 5; dp2++) {
              if (dp2 === dp) continue;
              const first = applyCrossSwap(rp, dp);
              if (!first) continue;
              const second = applyCrossSwap(rp2, dp2, first.r, first.d);
              if (second) raw.push(second);
            }
          }
        }
      }
    }
  }

  // Для «сильно» — полный ребаланс как ещё одно семейство кандидатов
  if (intensity >= 4) {
    const full = balanceTeams(players);
    raw.push({
      r: full.radiant.map((p) => ({
        userId: p.id,
        position: p.position,
        rating: p.finalRating,
      })),
      d: full.dire.map((p) => ({
        userId: p.id,
        position: p.position,
        rating: p.finalRating,
      })),
    });
  }

  const avoidKey =
    avoid && Object.keys(avoid).length ? fullAssignmentKey(avoid) : null;
  const candidates: Cand[] = [];
  const seen = new Set<string>();

  function pushVariant(v: { r: Slot[]; d: Slot[] }) {
    const scored = scoreCandidate(v.r, v.d);
    if (seen.has(scored.key)) return;
    seen.add(scored.key);
    if (avoidKey && scored.key === avoidKey) return;
    // Не оставлять игру 1 без изменений
    if (scored.switches === 0 && scored.posChanges === 0) return;
    if (onlyListedRoles && scored.offRole > 0) return;
    candidates.push(scored);
  }

  for (const base of raw) {
    pushVariant(base);
    if (forceRoleFit) {
      pushVariant(reassignRoles(base.r, base.d));
    }
    // Локальные перестановки позиций — больше уникальных раскладок
    if (intensity >= 2 && !onlyListedRoles) {
      const local = withinTeamPosSwaps(base.r, base.d);
      const step = intensity >= 4 ? 1 : 2;
      for (let i = 0; i < local.length; i += step) {
        pushVariant(local[i]);
        if (forceRoleFit && i % 4 === 0) {
          pushVariant(reassignRoles(local[i].r, local[i].d));
        }
      }
    } else if (onlyListedRoles && intensity >= 2) {
      // Только те внутрикомандные свапы, где оба остаются на указанных ролях
      for (const local of withinTeamPosSwaps(base.r, base.d)) {
        const ok = [...local.r, ...local.d].every((s) => {
          const p = byId[s.userId];
          return p ? isListedRole(p, s.position) : true;
        });
        if (ok) pushVariant(local);
      }
    }
  }

  if (candidates.length === 0) {
    // Фоллбек: если строго по ролям не набрали — берём минимум офф-ролей
    if (onlyListedRoles) {
      const soft: Cand[] = [];
      const softSeen = new Set<string>();
      for (const base of raw) {
        for (const v of [base, reassignRoles(base.r, base.d)]) {
          const scored = scoreCandidate(v.r, v.d);
          if (softSeen.has(scored.key)) continue;
          softSeen.add(scored.key);
          if (avoidKey && scored.key === avoidKey) continue;
          if (scored.switches === 0 && scored.posChanges === 0) continue;
          soft.push(scored);
        }
      }
      soft.sort(
        (a, b) => a.offRole - b.offRole || b.score - a.score || a.diff - b.diff
      );
      const minOff = soft[0]?.offRole ?? 0;
      const softPool = soft.filter((c) => c.offRole === minOff).slice(0, params.poolSize);
      if (softPool.length) {
        const pick = pickRandomWeighted(softPool);
        const radiant = pick.r
          .map((s) => ({ ...byId[s.userId], position: s.position }))
          .sort((a, b) => a.position - b.position);
        const dire = pick.d
          .map((s) => ({ ...byId[s.userId], position: s.position }))
          .sort((a, b) => a.position - b.position);
        return { radiant, dire, ...teamTotals(radiant, dire) };
      }
    }
    return balanceTeams(players);
  }

  candidates.sort((a, b) => b.score - a.score || a.diff - b.diff);

  // Пул «живых» вариантов уровня: достаточно смен команд и не раздутая сила
  const band = candidates.filter(
    (c) =>
      c.switches >= Math.max(2, params.minTeamSwitches - 2) &&
      c.switches <= params.maxTeamSwitches + 2 &&
      c.diff <= baseDiff + params.maxDiffSlack + 6 &&
      (!onlyListedRoles || c.offRole === 0)
  );

  let pool = (band.length >= 3 ? band : candidates).slice(
    0,
    Math.max(params.poolSize, 5)
  );

  // Если после avoid пул мал — добираем из общего рейтинга
  if (pool.length < 3) {
    pool = candidates.slice(0, Math.min(params.poolSize, candidates.length));
  }

  const pick = pickRandomWeighted(pool);

  const radiant = pick.r
    .map((s) => ({ ...byId[s.userId], position: s.position }))
    .sort((a, b) => a.position - b.position);
  const dire = pick.d
    .map((s) => ({ ...byId[s.userId], position: s.position }))
    .sort((a, b) => a.position - b.position);
  const totals = teamTotals(radiant, dire);
  return { radiant, dire, ...totals };
}
