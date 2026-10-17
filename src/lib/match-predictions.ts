import { prisma } from "@/lib/db";
import { lineupsForGame } from "@/lib/match-score";
import { teamDisplayName } from "@/lib/team-names";
import { editTelegramMessage, notifyChatId, sendTelegramMessage, type InlineKeyboard } from "@/lib/telegram";
import { displayName } from "@/lib/utils";

/*
 * Прогнозы на матч 5v5.
 * Админ открывает прогнозы, когда утверждены составы (на обе игры, если есть вторая).
 * Голосовать можно на сайте и в Telegram, пока сессия не стартовала («Старт сессии — все за ПК»).
 * Засчитанный прогноз = угаданы победители ВСЕХ игр дня, на которые были составы.
 */

export type Side = "RADIANT" | "DIRE";

type SessionLike = {
  id: string;
  status: string;
  predictionsOpen: boolean;
  radiantPlayerIds: string;
  direPlayerIds: string;
  teamAssignments: string;
  teamAssignmentsGame2: string | null;
  lineupsGame2Confirmed: boolean;
};

export function hasGame2Lineup(s: { teamAssignmentsGame2: string | null }) {
  return Boolean(s.teamAssignmentsGame2 && s.teamAssignmentsGame2 !== "{}");
}

/** Номера игр, на которые принимаются прогнозы */
export function predictionGames(s: SessionLike) {
  return hasGame2Lineup(s) ? [1, 2] : [1];
}

export function predictionsAcceptingVotes(s: SessionLike) {
  return s.predictionsOpen && s.status === "LINEUPS_CONFIRMED";
}

export function canOpenPredictions(s: SessionLike) {
  return s.status === "LINEUPS_CONFIRMED" && !s.predictionsOpen && (!hasGame2Lineup(s) || s.lineupsGame2Confirmed);
}

/** Названия команд игры N (Team <лучший игрок>) */
export async function teamNamesForGame(s: SessionLike, gameNumber: number) {
  const L = lineupsForGame(s, gameNumber);
  const users = await prisma.user.findMany({
    where: { id: { in: [...L.radiantIds, ...L.direIds] } },
    select: { id: true, firstName: true, lastName: true, username: true, profile: { select: { finalRating: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const named = (ids: string[]) =>
    ids.map((id) => {
      const u = byId.get(id);
      return { id, firstName: u?.firstName, lastName: u?.lastName, username: u?.username, finalRating: u?.profile?.finalRating ?? 0 };
    });
  return {
    RADIANT: teamDisplayName(named(L.radiantIds), "Team A"),
    DIRE: teamDisplayName(named(L.direIds), "Team B"),
  } as Record<Side, string>;
}

/** Сохранить прогноз (сайт и Telegram) */
export async function castPrediction(opts: { sessionId: string; userId: string; gameNumber: number; pick: Side }) {
  const session = await prisma.matchSession.findUnique({ where: { id: opts.sessionId } });
  if (!session) throw new Error("Матч не найден");
  if (!predictionsAcceptingVotes(session)) throw new Error("Прогнозы на этот матч закрыты");
  if (!predictionGames(session).includes(opts.gameNumber)) throw new Error("Нет такой игры");
  if (opts.pick !== "RADIANT" && opts.pick !== "DIRE") throw new Error("Неверная команда");
  const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { role: true } });
  if (user?.role !== "STUDENT") throw new Error("Прогнозы делают ученики");
  return prisma.matchPrediction.upsert({
    where: { sessionId_userId_gameNumber: { sessionId: opts.sessionId, userId: opts.userId, gameNumber: opts.gameNumber } },
    create: { sessionId: opts.sessionId, userId: opts.userId, gameNumber: opts.gameNumber, pick: opts.pick },
    update: { pick: opts.pick },
  });
}

/* ---------------- Telegram ---------------- */

function promptKeyboard(sessionId: string, gameNumber: number, names: Record<Side, string>): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: names.RADIANT, callback_data: `pred:${sessionId}:${gameNumber}:R` },
        { text: names.DIRE, callback_data: `pred:${sessionId}:${gameNumber}:D` },
      ],
    ],
  };
}

async function sendPrompt(chatId: string, s: SessionLike, gameNumber: number) {
  const names = await teamNamesForGame(s, gameNumber);
  await sendTelegramMessage(
    chatId,
    `🔮 <b>Прогноз · Победитель игры №${gameNumber}</b>\nКто победит? Голосование до старта матча.`,
    promptKeyboard(s.id, gameNumber, names)
  );
}

/** Админ открыл прогнозы: флаг + рассылка первой карточки всем ученикам с Telegram */
export async function openPredictions(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Матч не найден");
  if (!canOpenPredictions(session)) {
    throw new Error(
      session.predictionsOpen ? "Прогнозы уже открыты" : "Сначала утвердите составы на все игры (до старта сессии)"
    );
  }
  const updated = await prisma.matchSession.update({ where: { id: sessionId }, data: { predictionsOpen: true } });
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { telegramChatId: true, telegramId: true },
  });
  let sent = 0;
  for (const st of students) {
    const chatId = notifyChatId(st);
    if (!chatId) continue;
    try {
      await sendPrompt(chatId, updated, 1);
      sent++;
    } catch (e) {
      console.error("[predictions] tg failed", e);
    }
  }
  return { session: updated, sent };
}

/** Нажатие кнопки в Telegram: pred:<sessionId>:<game>:R|D */
export async function handlePredictionCallback(opts: {
  data: string;
  userId: string;
  chatId: string;
  messageId?: number;
}): Promise<string> {
  const [, sessionId, game, side] = opts.data.split(":");
  const gameNumber = Number(game);
  const pick: Side = side === "D" ? "DIRE" : "RADIANT";
  await castPrediction({ sessionId, userId: opts.userId, gameNumber, pick });

  const session = (await prisma.matchSession.findUnique({ where: { id: sessionId } }))!;
  const names = await teamNamesForGame(session, gameNumber);
  // Оставляем кнопки — можно передумать до старта; отмечаем выбор галочкой
  await editTelegramMessage(
    opts.chatId,
    opts.messageId,
    `🔮 <b>Прогноз · Победитель игры №${gameNumber}</b>\nТвой выбор: <b>${names[pick]}</b>. Можно передумать до старта матча.`,
    {
      inline_keyboard: [
        [
          { text: `${pick === "RADIANT" ? "✅ " : ""}${names.RADIANT}`, callback_data: `pred:${sessionId}:${gameNumber}:R` },
          { text: `${pick === "DIRE" ? "✅ " : ""}${names.DIRE}`, callback_data: `pred:${sessionId}:${gameNumber}:D` },
        ],
      ],
    }
  );

  // Следом — следующая игра, если на неё ещё нет прогноза
  const games = predictionGames(session);
  const next = games.find((g) => g > gameNumber);
  if (next) {
    const has = await prisma.matchPrediction.findUnique({
      where: { sessionId_userId_gameNumber: { sessionId, userId: opts.userId, gameNumber: next } },
    });
    if (!has) await sendPrompt(opts.chatId, session, next);
  }
  return `Прогноз: ${names[pick]}`;
}

/* ---------------- Итоги ---------------- */

/** Сколько раз ученик угадал все игры дня (для ачивки) */
export async function countCorrectPredictionDays(userId: string) {
  const preds = await prisma.matchPrediction.findMany({
    where: { userId, session: { status: "COMPLETED" } },
    select: {
      sessionId: true,
      gameNumber: true,
      pick: true,
      session: { select: { teamAssignmentsGame2: true, games: { select: { gameNumber: true, winnerTeam: true } } } },
    },
  });
  const bySession = new Map<string, typeof preds>();
  for (const p of preds) bySession.set(p.sessionId, [...(bySession.get(p.sessionId) ?? []), p]);
  let correct = 0;
  for (const list of bySession.values()) {
    const s = list[0].session;
    const games = hasGame2Lineup(s) ? [1, 2] : [1];
    const ok = games.every((g) => {
      const pred = list.find((p) => p.gameNumber === g);
      const res = (s.games ?? []).find((x) => x.gameNumber === g);
      return pred && res && res.winnerTeam === pred.pick;
    });
    if (ok) correct++;
  }
  return correct;
}

export type PredictionView = {
  open: boolean;
  closed: boolean;
  games: {
    gameNumber: number;
    names: Record<Side, string>;
    myPick: Side | null;
    winner: string | null;
    /** Распределение — только после закрытия */
    counts: Record<Side, number> | null;
  }[];
  /** Угадал все игры (после завершения) */
  allCorrect: boolean | null;
  /** Кто угадал все игры дня (после завершения) */
  dayCorrectNames: string[];
  dayCorrectTotal: number;
};

/** Данные для блока прогнозов на странице 5×5 */
export async function getPredictionView(
  s: SessionLike & { games: { gameNumber: number; winnerTeam: string }[] },
  viewerId: string,
  { showCounts = false }: { showCounts?: boolean } = {}
): Promise<PredictionView | null> {
  const everOpened = s.predictionsOpen;
  if (!everOpened) return null;
  const preds = await prisma.matchPrediction.findMany({ where: { sessionId: s.id }, select: { userId: true, gameNumber: true, pick: true } });
  const accepting = predictionsAcceptingVotes(s);
  const games = await Promise.all(
    predictionGames(s).map(async (g) => {
      const mine = preds.find((p) => p.userId === viewerId && p.gameNumber === g);
      const forGame = preds.filter((p) => p.gameNumber === g);
      return {
        gameNumber: g,
        names: await teamNamesForGame(s, g),
        myPick: (mine?.pick as Side) ?? null,
        winner: s.games.find((x) => x.gameNumber === g)?.winnerTeam ?? null,
        counts: accepting && !showCounts
          ? null
          : { RADIANT: forGame.filter((p) => p.pick === "RADIANT").length, DIRE: forGame.filter((p) => p.pick === "DIRE").length },
      };
    })
  );
  const finished = s.status === "COMPLETED" && games.every((g) => g.winner);
  const gameNums = predictionGames(s);
  const users = [...new Set(preds.map((p) => p.userId))];
  let dayCorrectNames: string[] = [];
  if (finished && users.length) {
    const correctIds = users.filter((u) =>
      gameNums.every((g) => {
        const pr = preds.find((p) => p.userId === u && p.gameNumber === g);
        const res = s.games.find((x) => x.gameNumber === g);
        return pr && res && res.winnerTeam === pr.pick;
      })
    );
    if (correctIds.length) {
      const people = await prisma.user.findMany({
        where: { id: { in: correctIds } },
        select: { id: true, firstName: true, lastName: true, username: true },
      });
      dayCorrectNames = people.map((u) => displayName(u));
    }
  }
  return {
    open: accepting,
    closed: !accepting,
    games,
    allCorrect: finished ? games.every((g) => g.myPick && g.myPick === g.winner) : null,
    dayCorrectNames,
    dayCorrectTotal: users.length,
  };
}
