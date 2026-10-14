import { parseJsonArray } from "@/lib/utils";
import {
  lineupForTeam,
  parseTeamAssignments,
  type LineupSlot,
  type TeamAssignment,
} from "@/lib/match-lineup";

/** Состав конкретной игры: №2 берёт teamAssignmentsGame2, если он есть. */
export function assignmentsForGame(
  session: { teamAssignments: string; teamAssignmentsGame2?: string | null },
  gameNumber: number
): TeamAssignment {
  const g1 = parseTeamAssignments(session.teamAssignments);
  const g2 = parseTeamAssignments(session.teamAssignmentsGame2);
  if (gameNumber >= 2 && Object.keys(g2).length > 0) return g2;
  return g1;
}

export function playerIdsForSide(
  assign: TeamAssignment,
  side: "RADIANT" | "DIRE"
): string[] {
  return Object.entries(assign)
    .filter(([, a]) => a.team === side)
    .map(([id]) => id);
}

/**
 * Счёт серии относительно составов игры 1.
 * Во 2-й игре стороны (Radiant/Dire) часто меняются после решафла —
 * победу относим к той команде игры 1, с которой больше пересечение победителей.
 */
export function seriesScoreByGame1Roster(session: {
  radiantPlayerIds: string;
  direPlayerIds: string;
  teamAssignments: string;
  teamAssignmentsGame2?: string | null;
  games: { gameNumber: number; winnerTeam: string }[];
}): { radiantWins: number; direWins: number } {
  const g1R = new Set(parseJsonArray(session.radiantPlayerIds));
  const g1D = new Set(parseJsonArray(session.direPlayerIds));
  let radiantWins = 0;
  let direWins = 0;

  for (const g of session.games) {
    if (g.winnerTeam !== "RADIANT" && g.winnerTeam !== "DIRE") continue;
    const assign = assignmentsForGame(session, g.gameNumber);
    const winnerIds = playerIdsForSide(assign, g.winnerTeam);
    const oR = winnerIds.filter((id) => g1R.has(id)).length;
    const oD = winnerIds.filter((id) => g1D.has(id)).length;
    if (oR > oD) radiantWins += 1;
    else if (oD > oR) direWins += 1;
    else if (g.winnerTeam === "RADIANT") radiantWins += 1;
    else direWins += 1;
  }

  return { radiantWins, direWins };
}

/**
 * Перекладывает счёт серии (относительно составов игры 1) на левую/правую
 * сторону текущего табло — после решафла Radiant/Dire часто меняются местами.
 */
export function seriesScoreForDisplayedSides(
  leftIds: string[],
  seriesRadiantIds: string[],
  seriesDireIds: string[],
  seriesRadiantWins: number,
  seriesDireWins: number
): { leftWins: number; rightWins: number } {
  const left = new Set(leftIds);
  const oR = seriesRadiantIds.filter((id) => left.has(id)).length;
  const oD = seriesDireIds.filter((id) => left.has(id)).length;
  if (oR >= oD) return { leftWins: seriesRadiantWins, rightWins: seriesDireWins };
  return { leftWins: seriesDireWins, rightWins: seriesRadiantWins };
}

export function lineupsForGame(
  session: {
    radiantPlayerIds: string;
    direPlayerIds: string;
    teamAssignments: string;
    teamAssignmentsGame2?: string | null;
  },
  gameNumber: number
): { radiantIds: string[]; direIds: string[]; radiant: LineupSlot[]; dire: LineupSlot[] } {
  const g2 = parseTeamAssignments(session.teamAssignmentsGame2);
  const useG2 = gameNumber >= 2 && Object.keys(g2).length > 0;
  const assign = useG2 ? g2 : parseTeamAssignments(session.teamAssignments);
  const radiantIds = useG2
    ? playerIdsForSide(assign, "RADIANT")
    : parseJsonArray(session.radiantPlayerIds);
  const direIds = useG2
    ? playerIdsForSide(assign, "DIRE")
    : parseJsonArray(session.direPlayerIds);
  return {
    radiantIds,
    direIds,
    radiant: lineupForTeam("RADIANT", radiantIds, assign),
    dire: lineupForTeam("DIRE", direIds, assign),
  };
}
