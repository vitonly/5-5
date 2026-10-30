import { prisma } from "@/lib/db";
import { getCoachIds } from "@/lib/coach";
import { POINT_VALUES, addPoints } from "@/lib/points";
import { addSeriesPoints, matchLabel } from "@/lib/match-series";
import { displayName, parseJsonArray, APP_TIMEZONE, formatDate } from "@/lib/utils";
import { parseTeamAssignments } from "@/lib/match-lineup";
import {
  absolutePublicUrl,
  notifyChatId,
  sendTelegramInviteDetailed,
  sendTelegramMessageDetailed,
  sendTelegramPhotoBuffer,
  type InlineKeyboard,
} from "@/lib/telegram";
import { renderDaySummaryPng } from "@/lib/match-summary-image";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function playerIdsFromSession(session: {
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
  status?: string;
}): boolean {
  if (session.mvpResolved) return false;
  // Голосование только после «Завершить сессию»
  if (session.status && session.status !== "COMPLETED") return false;
  const end = moscowEndOfDay(session.date);
  return Date.now() <= end.getTime();
}

async function chatIdForPlayer(
  userId: string,
  user: { telegramChatId?: string | null; telegramId?: string | null },
  rsvpChatId?: string | null
) {
  return rsvpChatId || notifyChatId(user) || null;
}

async function sendWithRetry(
  chatId: string,
  text: string,
  keyboard?: InlineKeyboard,
  photoUrl?: string | null
) {
  let result = photoUrl
    ? await sendTelegramInviteDetailed(chatId, text, keyboard, photoUrl)
    : await sendTelegramMessageDetailed(chatId, text, keyboard);
  if (!result.ok) {
    await sleep(400);
    result = photoUrl
      ? await sendTelegramInviteDetailed(chatId, text, keyboard, photoUrl)
      : await sendTelegramMessageDetailed(chatId, text, keyboard);
  }
  return result.ok;
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
  if (session.status !== "COMPLETED") {
    throw new Error("Голосование MVP откроется после завершения сессии");
  }
  if (!isMvpVotingOpen(session)) {
    throw new Error("Время голосования MVP истекло (до 23:59 МСК)");
  }

  const players = playerIdsFromSession(session);
  if (!players.includes(opts.voterId)) {
    throw new Error("Голосовать могут только участники игрового дня");
  }
  if (!players.includes(opts.nomineeId)) {
    throw new Error("Номинант должен быть из состава дня");
  }
  if ((await getCoachIds()).has(opts.nomineeId)) {
    throw new Error("Тренер не участвует в выборе MVP — выберите ученика");
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

  if (updated.length >= players.length) {
    const resolved = await resolveMvpIfReady(opts.sessionId);
    return {
      votes: updated.length,
      players: players.length,
      resolved: Boolean(resolved),
      winnerId: resolved?.winnerId ?? null,
    };
  }

  return { votes: updated.length, players: players.length, resolved: false, winnerId: null };
}

/** Рассылка итогов дня: картинка всем ученикам + тренеру. */
export async function broadcastMvpResult(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: {
      rsvps: true,
      mvpVotes: true,
    },
  });
  if (!session || !session.mvpResolved) return { sent: 0 };

  const players = playerIdsFromSession(session);
  const users = await prisma.user.findMany({ where: { id: { in: players } } });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  const counts = new Map<string, number>();
  for (const v of session.mvpVotes) {
    counts.set(v.nomineeId, (counts.get(v.nomineeId) ?? 0) + 1);
  }
  const medals = ["🥇", "🥈", "🥉"];
  const top3 = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n], i) => {
      const u = byId[id];
      return `  ${medals[i]} ${u ? displayName(u) : "?"} — <b>${n}</b>`;
    })
    .join("\n");

  // «Итоги 5v5» или «Итоги 5v5 «Игры по сертификатам»»
  const label = await matchLabel(session);
  let caption: string;
  if (session.mvpWinnerId && byId[session.mvpWinnerId]) {
    const w = byId[session.mvpWinnerId];
    caption =
      `🏆 <b>Итоги ${label}</b> — ${formatDate(session.date)}\n` +
      `MVP: <b>${displayName(w)}</b> ⭐ · +${POINT_VALUES.MVP_DAY} очк.${session.seriesId ? " в мини-сезон" : ""}` +
      (top3 ? `\n\n<b>Топ-3:</b>\n${top3}` : "");
  } else {
    caption =
      `🏆 <b>Итоги ${label}</b> — ${formatDate(session.date)}\n` +
      `MVP не определён (ничья или нет голосов).` +
      (top3 ? `\n\n<b>Топ-3:</b>\n${top3}` : "");
  }
  const matchLink = absolutePublicUrl(`/match?open=${sessionId}`);
  if (matchLink) caption += `\n\n<a href="${matchLink}">Открыть матч</a>`;

  const png = await renderDaySummaryPng(sessionId).catch((e) => {
    console.error("[mvp] summary image", e);
    return null;
  });

  const recipients = await prisma.user.findMany({
    where: { role: { in: ["STUDENT", "ADMIN"] } },
    select: { id: true, telegramChatId: true, telegramId: true },
  });
  const rsvpByUser = Object.fromEntries(
    (session.rsvps ?? []).map((r) => [r.userId, r.tgChatId] as const)
  );

  let sent = 0;
  for (const u of recipients) {
    const chatId = rsvpByUser[u.id] || notifyChatId(u);
    if (!chatId) continue;
    let ok = false;
    if (png) {
      let result = await sendTelegramPhotoBuffer(chatId, png.buffer, png.filename, caption);
      if (!result.ok) {
        await sleep(400);
        result = await sendTelegramPhotoBuffer(chatId, png.buffer, png.filename, caption);
      }
      ok = result.ok;
    } else {
      ok = await sendWithRetry(chatId, caption);
    }
    if (ok) sent += 1;
    await sleep(80);
  }
  return { sent };
}

export async function resolveMvpIfReady(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: { mvpVotes: true },
  });
  if (!session || session.mvpResolved) return null;
  // Не закрывать MVP, пока сессия не завершена (голосование ещё не стартовало)
  if (session.status !== "COMPLETED") return null;

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
  }

  // Атомарно закрываем — защита от двойных очков/рассылки при гонке
  const claimed = await prisma.matchSession.updateMany({
    where: { id: sessionId, mvpResolved: false },
    data: { mvpResolved: true, mvpWinnerId: winnerId },
  });
  if (claimed.count === 0) return null;

  if (winnerId) {
    const source = { type: "MATCH_MVP", id: sessionId };
    // День мини-сезона: MVP идёт в его таблицу, а не в общие очки школы
    if (session.seriesId) {
      await addSeriesPoints(session.seriesId, winnerId, POINT_VALUES.MVP_DAY, "MVP игрового дня 5v5", source);
    } else {
      await addPoints(winnerId, POINT_VALUES.MVP_DAY, "MVP игрового дня 5v5", source);
    }
  }

  const broadcast = await broadcastMvpResult(sessionId).catch((e) => {
    console.error("[mvp broadcast]", e);
    return { sent: 0 };
  });

  return {
    winnerId,
    votes: session.mvpVotes.length,
    tied: winners.length > 1,
    announced: broadcast.sent,
    allVoted,
  };
}

export async function processMvpDeadlines() {
  const sessions = await prisma.matchSession.findMany({
    where: {
      mvpResolved: false,
      status: "COMPLETED",
    },
    select: { id: true, date: true, mvpResolved: true },
  });

  let closed = 0;
  for (const s of sessions) {
    // Досрочно, если все уже проголосовали — или после 23:59 МСК
    const result = await resolveMvpIfReady(s.id);
    if (result) closed += 1;
  }
  return closed;
}

export async function sendMvpVoteInvites(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: {
      rsvps: true,
      mvpVotes: true,
    },
  });
  if (!session) {
    return { sent: 0, skippedNoTg: 0, skippedVoted: 0, failed: 0, total: 0 };
  }
  if (session.status !== "COMPLETED") {
    throw new Error("Сначала завершите сессию — потом можно слать опрос MVP");
  }
  if (session.mvpResolved) {
    throw new Error("Голосование MVP уже закрыто");
  }
  if (!isMvpVotingOpen(session)) {
    throw new Error("Время голосования MVP истекло (до 23:59 МСК)");
  }

  const players = playerIdsFromSession(session);
  const users = await prisma.user.findMany({ where: { id: { in: players } } });
  const coachIds = await getCoachIds();   // за тренера MVP не голосуют
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const rsvpByUser = Object.fromEntries(
    session.rsvps.map((r) => [r.userId, r.tgChatId] as const)
  );
  const voted = new Set(session.mvpVotes.map((v) => v.voterId));

  let sent = 0;
  let skippedNoTg = 0;
  let skippedVoted = 0;
  let failed = 0;

  for (const voterId of players) {
    const voter = byId[voterId];
    if (!voter) continue;
    if (voted.has(voterId)) {
      skippedVoted += 1;
      continue;
    }
    const chatId = await chatIdForPlayer(voterId, voter, rsvpByUser[voterId]);
    if (!chatId) {
      skippedNoTg += 1;
      continue;
    }

    const nominees = players.filter((id) => id !== voterId && !coachIds.has(id));
    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < nominees.length; i += 2) {
      rows.push(
        nominees.slice(i, i + 2).map((id) => ({
          text: displayName(byId[id]),
          callback_data: `mvp:${sessionId}:${id}`,
        }))
      );
    }
    const keyboard: InlineKeyboard = { inline_keyboard: rows };
    const text =
      `🏆 <b>MVP игрового дня</b> — ${formatDate(session.date)}\n\n` +
      `Кто был лучшим сегодня?\n` +
      `Голос один (сайт или TG), анонимно для остальных.\n` +
      `За себя голосовать нельзя. До 23:59 МСК.`;

    const ok = await sendWithRetry(chatId, text, keyboard);
    if (ok) sent += 1;
    else failed += 1;
    await sleep(120);
  }

  return {
    sent,
    skippedNoTg,
    skippedVoted,
    failed,
    total: players.length,
  };
}

/** Статус для ученика: кто проголосовал / кто нет + топ по голосам (без «кто за кого»). */
export async function getMvpStatusForUser(sessionId: string, userId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: {
      mvpVotes: true,
    },
  });
  if (!session) return null;
  const players = playerIdsFromSession(session);
  if (!players.includes(userId)) return null;
  const coachIds = await getCoachIds();

  const users = await prisma.user.findMany({
    where: { id: { in: players } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      photoUrl: true,
    },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const votedIds = new Set(session.mvpVotes.map((v) => v.voterId));
  const myVote = session.mvpVotes.find((v) => v.voterId === userId);

  const voted = players
    .filter((id) => votedIds.has(id))
    .map((id) => displayName(byId[id]));
  const pending = players
    .filter((id) => !votedIds.has(id))
    .map((id) => displayName(byId[id]));

  const counts = new Map<string, number>();
  for (const v of session.mvpVotes) {
    counts.set(v.nomineeId, (counts.get(v.nomineeId) ?? 0) + 1);
  }
  const standings = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || displayName(byId[a[0]]).localeCompare(displayName(byId[b[0]])))
    .slice(0, 3)
    .map(([id, votes], i) => ({
      place: i + 1,
      id,
      name: displayName(byId[id]),
      votes,
    }));

  const winner = session.mvpWinnerId ? byId[session.mvpWinnerId] : null;

  return {
    sessionId,
    open: isMvpVotingOpen(session) && !myVote,
    resolved: session.mvpResolved,
    winnerId: session.mvpWinnerId,
    winnerName: winner ? displayName(winner) : null,
    votesCount: session.mvpVotes.length,
    playersCount: players.length,
    /** Только факт «я уже голосовал», без имени номинанта — анонимность */
    hasVoted: Boolean(myVote),
    nominees: players.filter((id) => id !== userId && !coachIds.has(id)),
    votedNames: voted,
    pendingNames: pending,
    /** Топ-3 номинантов по числу голосов (без раскрытия избирателей) */
    standings,
  };
}

/** Для админа: полная расшифровка кто за кого. */
export async function getMvpAdminBreakdown(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: {
      mvpVotes: {
        include: {
          voter: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
          nominee: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) return null;
  const players = playerIdsFromSession(session);
  const users = await prisma.user.findMany({
    where: { id: { in: players } },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const votedIds = new Set(session.mvpVotes.map((v) => v.voterId));

  return {
    sessionId,
    resolved: session.mvpResolved,
    winnerId: session.mvpWinnerId,
    winnerName: session.mvpWinnerId
      ? displayName(byId[session.mvpWinnerId] ?? { firstName: "?" })
      : null,
    votes: session.mvpVotes.map((v) => ({
      voterId: v.voterId,
      voterName: displayName(v.voter),
      nomineeId: v.nomineeId,
      nomineeName: displayName(v.nominee),
      at: v.createdAt,
    })),
    pendingNames: players
      .filter((id) => !votedIds.has(id))
      .map((id) => displayName(byId[id])),
    votesCount: session.mvpVotes.length,
    playersCount: players.length,
  };
}

/** Текст статуса MVP для TG-кнопки (анонимно: кто голосовал, не за кого). */
export async function formatMvpStatusTelegram(userId: string) {
  const session = await prisma.matchSession.findFirst({
    where: {
      OR: [
        { mvpResolved: false, status: "COMPLETED" },
        { mvpResolved: true, date: { gte: new Date(Date.now() - 36 * 3600 * 1000) } },
      ],
    },
    include: { mvpVotes: true },
    orderBy: { date: "desc" },
  });
  if (!session) {
    return {
      text:
        "Сейчас нет активного голосования MVP.\n" +
        "Оно откроется после того, как админ нажмёт «Завершить сессию».",
      keyboard: null as InlineKeyboard | null,
    };
  }

  const players = playerIdsFromSession(session);
  if (!players.includes(userId)) {
    return {
      text: `MVP ${formatDate(session.date)}: вы не в составе этого игрового дня.`,
      keyboard: null as InlineKeyboard | null,
    };
  }

  const status = await getMvpStatusForUser(session.id, userId);
  if (!status) {
    return { text: "Нет данных по MVP.", keyboard: null as InlineKeyboard | null };
  }

  const medals = ["🥇", "🥈", "🥉"];
  const standingsBlock =
    status.standings.length > 0
      ? status.standings
          .map(
            (s) =>
              `  ${medals[s.place - 1] ?? `${s.place}.`} ${s.name} — <b>${s.votes}</b>`
          )
          .join("\n")
      : "  — пока нет голосов";

  if (status.resolved) {
    const line = status.winnerName
      ? `Победитель: <b>${status.winnerName}</b> (+${POINT_VALUES.MVP_DAY})`
      : "Ничья — очки не начислены.";
    return {
      text:
        `🏆 <b>MVP</b> — ${formatDate(session.date)}\n` +
        `Голосование закрыто.\n${line}\n` +
        `Голосов: ${status.votesCount}/${status.playersCount}\n\n` +
        `<b>Топ-3:</b>\n${standingsBlock}`,
      keyboard: null as InlineKeyboard | null,
    };
  }

  const votedBlock =
    status.votedNames.length > 0
      ? status.votedNames.map((n) => `  ✅ ${n}`).join("\n")
      : "  —";
  const pendingBlock =
    status.pendingNames.length > 0
      ? status.pendingNames.map((n) => `  ⏳ ${n}`).join("\n")
      : "  —";

  let text =
    `🏆 <b>MVP игрового дня</b> — ${formatDate(session.date)}\n` +
    `Голосов: <b>${status.votesCount}/${status.playersCount}</b>\n` +
    `(кто за кого — скрыто)\n\n` +
    `<b>Топ-3:</b>\n${standingsBlock}\n\n` +
    `<b>Проголосовали:</b>\n${votedBlock}\n\n` +
    `<b>Ещё не голосовали:</b>\n${pendingBlock}`;

  let keyboard: InlineKeyboard | null = null;
  if (status.open) {
    text += `\n\nВы ещё не голосовали — выберите ниже (или на сайте).`;
    const users = await prisma.user.findMany({
      where: { id: { in: status.nominees } },
      select: { id: true, firstName: true, lastName: true, username: true },
    });
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < status.nominees.length; i += 2) {
      rows.push(
        status.nominees.slice(i, i + 2).map((id) => ({
          text: displayName(byId[id]),
          callback_data: `mvp:${session.id}:${id}`,
        }))
      );
    }
    keyboard = { inline_keyboard: rows };
  } else if (status.hasVoted) {
    text += `\n\n✅ Ваш голос учтён.`;
  }

  return { text, keyboard };
}
