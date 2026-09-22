import type { DotaRole } from "@prisma/client";

export interface BalancePlayer {
  id: string;
  name: string;
  finalRating: number;
  primaryRole?: DotaRole | null;
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

// Саппорт универсален: SUPPORT и HARD_SUPPORT могут занять и 4, и 5 позицию.
function assignPositions(team: BalancePlayer[]): AssignedPlayer[] {
  const taken = new Set<number>();
  const assigned = new Map<string, number>();

  // 1. Кор-роли на свои позиции
  for (const p of team) {
    const pos = p.primaryRole ? CORE_POSITION[p.primaryRole] : undefined;
    if (pos && !taken.has(pos)) {
      taken.add(pos);
      assigned.set(p.id, pos);
    }
  }

  // 2. Саппорты (универсальны) — сначала хард-саппорт на 5, обычный на 4
  const supports = team.filter(
    (p) => !assigned.has(p.id) && (p.primaryRole === "SUPPORT" || p.primaryRole === "HARD_SUPPORT")
  );
  const supportSlots = [5, 4].filter((s) => !taken.has(s));
  supports.sort((a, b) => (a.primaryRole === "HARD_SUPPORT" ? -1 : 1));
  for (const s of supports) {
    const slot = supportSlots.shift();
    if (slot) {
      taken.add(slot);
      assigned.set(s.id, slot);
    }
  }

  // 3. Остальные игроки заполняют свободные позиции по порядку
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
