import { prisma } from "@/lib/db";
import { POINT_VALUES, addPoints } from "@/lib/points";
import { displayName, parseJsonArray, APP_TIMEZONE } from "@/lib/utils";
import { parseTeamAssignments } from "@/lib/match-lineup";
import { notifyChatId, sendTelegramMessage, type InlineKeyboard } from "@/lib/telegram";

function playerIdsFromSession(session: {
  radiantPlayerIds: string;
  direPlayerIds: string;
  teamAssignments: string;
  teamAssignmentsGame2?: string | null;
}) {
  const a1 = parseTeamAssignments(session.teamAssignments);
  const ids = Object.keys(a1);
  if (ids.length === 10) return ids;
  return [
    ...parseJsonArray(session.radiantPlayerIds),
    ...parseJsonArray(session.direPlayerIds),
  ];
}

function moscowEndOfDay(date: Date): Date {
  // 23:59:59.999 Europe/Moscow on the calendar day of `date` in Moscow
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return new Date(`${y}-${m}-${d}T23:59:59.999+03:00`);
}

export function isMvpVotingOpen(session: {
  date: Date;
  mvpResolved: boolean;
  startedAt?: Date | null;
}): boolean {
  if (session.mvpResolved) return false;
  const end = moscowEndOfDay(session.date);
  return Date.now() <= end.getTime();
}

export async function castMvpVote(opts: {
  sessionId: string;
  voterId: string;
  nomineeId: string;
}) {
  const session = await prisma.matchSession.findUnique({
    where: { id: opts.sessionId },
    include: { mvpVotes: true },
  });
  if (!session) throw new Error("Сессия не найдена");
  if (session.mvpResolved) throw new Error("Голосование MVP уже закрыто");
  if (!isMvpVotingOpen(session)) throw new Error("Время голосования MVP истекло (до 23:59 МСК)");

  const players = playerIdsFromSession(session);
  if (!players.includes(opts.voterId)) {
    throw new Error("Голосовать могут только участники игрового дня");
  }
  if (!players.includes(opts.nomineeId)) {
    throw new Error("Номинант должен быть из состава дня");
  }
  if (opts.voterId === opts.nomineeId) {
    throw new Error("Нельзя голосовать за себя");
  }

  const existing = session.mvpVotes.find((v) => v.voterId === opts.voterId);
  if (existing) {
    throw new Error("Вы уже проголосовали за MVP");
  }

  await prisma.matchDayMvpVote.create({
    data: {
      sessionId: opts.sessionId,
      voterId: opts.voterId,
      nomineeId: opts.nomineeId,
    },
  });

  const updated = await prisma.matchDayMvpVote.findMany({
    where: { sessionId: opts.sessionId },
  });

  // Все 10 проголосовали → закрыть досрочно
  if (updated.length >= players.length) {
    await resolveMvpIfReady(opts.sessionId);
  }

  return { votes: updated.length, players: players.length };
}

export async function resolveMvpIfReady(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: {
      mvpVotes: true,
    },
  });
  if (!session || session.mvpResolved) return null;

  const players = playerIdsFromSession(session);
  const open = isMvpVotingOpen(session);
  const allVoted = session.mvpVotes.length >= players.length;
  if (!allVoted && open) return null;

  const counts = new Map<string, number>();
  for (const v of session.mvpVotes) {
    counts.set(v.nomineeId, (counts.get(v.nomineeId) ?? 0) + 1);
  }
  let best = 0;
  let winners: string[] = [];
  for (const [id, n] of counts) {
    if (n > best) {
      best = n;
      winners = [id];
    } else if (n === best) {
      winners.push(id);
    }
  }

  let winnerId: string | null = null;
  if (winners.length === 1 && best > 0) {
    winnerId = winners[0];
    await addPoints(
      winnerId,
      POINT_VALUES.MVP_DAY,
      "MVP игрового дня 5v5",
      { type: "MATCH_MVP", id: sessionId }
    );
  }

  await prisma.matchSession.update({
    where: { id: sessionId },
    data: { mvpResolved: true, mvpWinnerId: winnerId },
  });

  return { winnerId, votes: session.mvpVotes.length, tied: winners.length > 1 };
}

export async function sendMvpVoteInvites(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: {
      rsvps: { include: { user: true } },
    },
  });
  if (!session) return;

  const players = playerIdsFromSession(session);
  const users = await prisma.user.findMany({ where: { id: { in: players } } });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  for (const voterId of players) {
    const voter = byId[voterId];
    if (!voter) continue;
    const chatId = notifyChatId(voter);
    if (!chatId) continue;

    const nominees = players.filter((id) => id !== voterId);
    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < nominees.length; i += 2) {
      const row = nominees.slice(i, i + 2).map((id) => ({
        text: displayName(byId[id]),
        callback_data: `mvp:${sessionId}:${id}`,
      }));
      rows.push(row);
    }
    const keyboard: InlineKeyboard = { inline_keyboard: rows };
    await sendTelegramMessage(
      chatId,
      `🏆 <b>MVP игрового дня</b>\n\nКто был лучшим сегодня? Голос один (сайт или TG). За себя голосовать нельзя. До 23:59 МСК.`,
      keyboard
    );
  }
}

export async function getMvpStatusForUser(sessionId: string, userId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: { mvpVotes: true },
  });
  if (!session) return null;
  const players = playerIdsFromSession(session);
  if (!players.includes(userId)) return null;
  const myVote = session.mvpVotes.find((v) => v.voterId === userId);
  const nominees = players.filter((id) => id !== userId);
  return {
    sessionId,
    open: isMvpVotingOpen(session) && !myVote,
    resolved: session.mvpResolved,
    winnerId: session.mvpWinnerId,
    votesCount: session.mvpVotes.length,
    playersCount: players.length,
    myNomineeId: myVote?.nomineeId ?? null,
    nominees,
  };
}
