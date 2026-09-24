import { parseJsonArray } from "@/lib/utils";

export type TeamAssignment = Record<string, { team: string; position: number }>;

export function parseTeamAssignments(raw: string | null | undefined): TeamAssignment {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TeamAssignment;
  } catch {
    return {};
  }
}

export type LineupSlot = {
  userId: string;
  position: number;
  team: "RADIANT" | "DIRE";
};

/** Состав команды, отсортированный по позиции 1–5 */
export function lineupForTeam(
  team: "RADIANT" | "DIRE",
  playerIds: string[],
  assignments: TeamAssignment
): LineupSlot[] {
  const slots: LineupSlot[] = playerIds.map((userId, index) => {
    const a = assignments[userId];
    return {
      userId,
      team,
      position: a?.position && a.position >= 1 && a.position <= 5 ? a.position : index + 1,
    };
  });
  return slots.sort((a, b) => a.position - b.position);
}

export function buildAssignmentsFromLineups(
  radiant: { userId: string; position: number }[],
  dire: { userId: string; position: number }[]
): { assignmentsJson: string; radiantPlayerIds: string; direPlayerIds: string } {
  const map: TeamAssignment = {};
  for (const s of radiant) {
    map[s.userId] = { team: "RADIANT", position: s.position };
  }
  for (const s of dire) {
    map[s.userId] = { team: "DIRE", position: s.position };
  }
  return {
    assignmentsJson: JSON.stringify(map),
    radiantPlayerIds: JSON.stringify(radiant.map((s) => s.userId)),
    direPlayerIds: JSON.stringify(dire.map((s) => s.userId)),
  };
}

export function validateLineups(
  radiant: { userId: string; position: number }[],
  dire: { userId: string; position: number }[]
): string | null {
  if (radiant.length !== 5 || dire.length !== 5) {
    return "В каждой команде должно быть 5 игроков";
  }
  const all = [...radiant, ...dire].map((s) => s.userId);
  if (new Set(all).size !== 10) {
    return "Игроки не должны повторяться";
  }
  for (const team of [radiant, dire]) {
    const positions = team.map((s) => s.position).sort((a, b) => a - b);
    if (positions.join(",") !== "1,2,3,4,5") {
      return "В каждой команде позиции должны быть 1–5 без повторов";
    }
  }
  return null;
}

export function playerIdsFromSession(session: {
  radiantPlayerIds: string;
  direPlayerIds: string;
}): string[] {
  return [...parseJsonArray(session.radiantPlayerIds), ...parseJsonArray(session.direPlayerIds)];
}
