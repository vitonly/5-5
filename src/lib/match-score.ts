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

/** Капитан стороны = игрок с наибольшей силой (как в teamDisplayName). */
export function pickCaptainId(
  playerIds: string[],
  ratingById?: Record<string, number> | null
): string | null {
  if (!playerIds.length) return null;
  if (!ratingById) return null;
  let best = playerIds[0];
  let bestPower = ratingById[best] ?? 0;
  for (let i = 1; i < playerIds.length; i++) {
    const id = playerIds[i];
    const power = ratingById[id] ?? 0;
    if (power > bestPower) {
      best = id;
      bestPower = power;
    }
  }
  return best;
}

export function ratingsFromProfiles(
  entries: { id: string; finalRating?: number | null }[]
): Record<string, number> {
  return Object.fromEntries(entries.map((e) => [e.id, e.finalRating ?? 0]));
}

/**
 * Счёт серии относительно именованных команд игры 1.
 * После решафла стороны Radiant/Dire часто меняются — победу относим к той
 * команде игры 1, чей капитан (сильнейший на стороне G1) оказался на
 * победившей стороне. Если капитан неизвестен — fallback на majority overlap.
 */
export function seriesScoreByGame1Roster(
  session: {
    radiantPlayerIds: string;
    direPlayerIds: string;
    teamAssignments: string;
    teamAssignmentsGame2?: string | null;
    games: { gameNumber: number; winnerTeam: string }[];
  },
  ratingById?: Record<string, number> | null
): { radiantWins: number; direWins: number } {
  const g1R = parseJsonArray(session.radiantPlayerIds);
  const g1D = parseJsonArray(session.direPlayerIds);
  const g1RSet = new Set(g1R);
  const g1DSet = new Set(g1D);
  const radiantCaptain = pickCaptainId(g1R, ratingById);
  const direCaptain = pickCaptainId(g1D, ratingById);
  let radiantWins = 0;
  let direWins = 0;

  for (const g of session.games) {
    if (g.winnerTeam !== "RADIANT" && g.winnerTeam !== "DIRE") continue;
    const assign = assignmentsForGame(session, g.gameNumber);
    const winnerIds = playerIdsForSide(assign, g.winnerTeam);

    if (radiantCaptain && winnerIds.includes(radiantCaptain)) {
      radiantWins += 1;
      continue;
    }
    if (direCaptain && winnerIds.includes(direCaptain)) {
      direWins += 1;
      continue;
    }

    // Fallback: majority overlap with G1 rosters
    const oR = winnerIds.filter((id) => g1RSet.has(id)).length;
    const oD = winnerIds.filter((id) => g1DSet.has(id)).length;
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

/** G1-сторона игрока (для камбэка / MVP в поражении). */
export function playerG1Side(
  session: { radiantPlayerIds: string; direPlayerIds: string },
  userId: string
): "RADIANT" | "DIRE" | null {
  if (parseJsonArray(session.radiantPlayerIds).includes(userId)) return "RADIANT";
  if (parseJsonArray(session.direPlayerIds).includes(userId)) return "DIRE";
  return null;
}
