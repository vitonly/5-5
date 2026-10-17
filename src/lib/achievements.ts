import { prisma } from "@/lib/db";
import { countCorrectPredictionDays } from "@/lib/match-predictions";
import { playerG1Side, seriesScoreByGame1Roster } from "@/lib/match-score";
import { addPoints, positionForMatchGame } from "@/lib/points";
import { absolutePublicUrl, notifyChatId, sendTelegramMessage } from "@/lib/telegram";
import { APP_TIMEZONE, displayName } from "@/lib/utils";
import type { ReplayData } from "@/lib/replay";

/*
 * Ачивки СТАРТ+.
 * Считаются по всей истории платформы.
 * Уровни: 1 бронза (0 очков) · 2 серебро (+0.5) · 3 золото (+1).
 * Секретные — один уровень «серебро» (+0.5); условие видит только тот, кто получил ачивку.
 * Открытая ачивка хранится в UserAchievement и больше не отбирается.
 *
 * Запуск v2: пока админ не выполнил пересборку (/api/admin/achievements/rebuild?apply=1),
 * автоматическая выдача выключена — чтобы ученикам не прилетели десятки сообщений за прошлое.
 */

export type Tier = 1 | 2 | 3;
export const TIER_POINTS: Record<Tier, number> = { 1: 0, 2: 0.5, 3: 1 };
export const TIER_LABELS: Record<Tier, string> = { 1: "бронза", 2: "серебро", 3: "золото" };

export type AchievementCategory = "lessons" | "homework" | "matches" | "mvp";

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  lessons: "Занятия",
  homework: "Домашки",
  matches: "5v5",
  mvp: "MVP",
};

export type AchievementStats = {
  lessonsAttended: number;
  lessonStreak: number;
  diaryStreak: number;
  hwExcellent: number;
  hwOnTimeStreak: number;
  hwLastSecond: number;
  hwSpeedster: number;
  bookworm: number;
  matchesPlayed: number;
  matchWinStreak: number;
  winPositions: number;
  comebacks: number;
  cleanSweepStreak: number;
  immortal: number;
  butcher: number;
  angel: number;
  carried: number;
  mvpCount: number;
  mvpInLoss: number;
  predictionsCorrect: number;
};

export type AchievementDef = {
  code: string;
  title: string;
  /** {n} заменяется на порог уровня */
  description: string;
  category: AchievementCategory;
  /** имя иконки из набора ACHIEVEMENT_ICONS (клиент) */
  icon: string;
  metric: keyof AchievementStats;
  tiers: { tier: Tier; need: number; label?: string }[];
  secret?: boolean;
};

const SECRET = [{ tier: 2 as Tier, need: 1 }];

export const ACHIEVEMENTS: AchievementDef[] = [
  // Занятия
  { code: "regular", title: "Завсегдатай", description: "Посетить {n} занятий", category: "lessons", icon: "calendar-check", metric: "lessonsAttended", tiers: [{ tier: 1, need: 10 }, { tier: 2, need: 25 }, { tier: 3, need: 35 }] },
  { code: "iron_streak", title: "Железная серия", description: "{n} занятий подряд без пропусков", category: "lessons", icon: "flame", metric: "lessonStreak", tiers: [{ tier: 1, need: 10 }, { tier: 2, need: 20 }, { tier: 3, need: 30 }] },
  { code: "diary", title: "Аналитик", description: "Заполнять дневник прогресса {n} дней подряд (в тот же день)", category: "lessons", icon: "notebook-pen", metric: "diaryStreak", tiers: [{ tier: 1, need: 30 }, { tier: 2, need: 60 }, { tier: 3, need: 90 }] },
  { code: "bookworm", title: "Книжный червь", description: "Открыть все материалы на сайте", category: "lessons", icon: "book-open", metric: "bookworm", tiers: SECRET, secret: true },

  // Домашки
  { code: "first_excellent", title: "Отличник", description: "Получить «отлично» за домашку", category: "homework", icon: "badge-check", metric: "hwExcellent", tiers: [{ tier: 1, need: 1 }] },
  { code: "perfectionist", title: "Перфекционист", description: "{n} домашек на «отлично»", category: "homework", icon: "sparkles", metric: "hwExcellent", tiers: [{ tier: 1, need: 5 }, { tier: 2, need: 15 }, { tier: 3, need: 30 }] },
  { code: "punctual", title: "Пунктуальный", description: "{n} домашек подряд сданы вовремя", category: "homework", icon: "alarm-clock-check", metric: "hwOnTimeStreak", tiers: [{ tier: 1, need: 3 }, { tier: 2, need: 5 }, { tier: 3, need: 10 }] },
  { code: "last_second", title: "На последней секунде", description: "Сдать домашку меньше чем за 10 минут до дедлайна", category: "homework", icon: "timer", metric: "hwLastSecond", tiers: SECRET, secret: true },
  { code: "speedster", title: "Скорострел", description: "Сдать домашку в течение часа после выдачи", category: "homework", icon: "rocket", metric: "hwSpeedster", tiers: SECRET, secret: true },

  // 5v5
  { code: "veteran", title: "Ветеран", description: "Сыграть {n} игр 5v5", category: "matches", icon: "swords", metric: "matchesPlayed", tiers: [{ tier: 1, need: 10 }, { tier: 2, need: 15 }, { tier: 3, need: 25 }] },
  { code: "win_streak", title: "Серия побед", description: "{n} побед подряд", category: "matches", icon: "zap", metric: "matchWinStreak", tiers: [{ tier: 1, need: 3 }, { tier: 2, need: 5 }, { tier: 3, need: 7 }] },
  { code: "universal", title: "Универсал", description: "Победы на {n} разных позициях", category: "matches", icon: "shuffle", metric: "winPositions", tiers: [{ tier: 2, need: 3 }, { tier: 3, need: 5 }] },
  { code: "oracle", title: "Провидец", description: "Угадать победителей всех игр дня {n} раз", category: "matches", icon: "eye", metric: "predictionsCorrect", tiers: [{ tier: 1, need: 5 }, { tier: 2, need: 10 }, { tier: 3, need: 15 }] },
  { code: "comeback", title: "Камбэк", description: "Проиграть первую игру дня и выиграть серию", category: "matches", icon: "rotate-ccw", metric: "comebacks", tiers: SECRET, secret: true },
  { code: "clean_sweep", title: "Всухую", description: "Выиграть 3 серии подряд со счётом 2:0", category: "matches", icon: "crown", metric: "cleanSweepStreak", tiers: [{ tier: 2, need: 3 }], secret: true },
  { code: "immortal", title: "Бессмертный", description: "Выиграть игру без единой смерти (по демке)", category: "matches", icon: "shield", metric: "immortal", tiers: SECRET, secret: true },
  { code: "butcher", title: "Мясник", description: "20+ убийств за одну игру (по демке)", category: "matches", icon: "axe", metric: "butcher", tiers: SECRET, secret: true },
  { code: "angel", title: "Ангел-хранитель", description: "25+ ассистов за одну игру (по демке)", category: "matches", icon: "heart-handshake", metric: "angel", tiers: SECRET, secret: true },
  { code: "carried", title: "Тащил как мог", description: "Проиграть, но иметь самый большой нетворс в игре (по демке)", category: "matches", icon: "dumbbell", metric: "carried", tiers: SECRET, secret: true },

  // MVP
  { code: "mvp", title: "MVP", description: "Стать MVP дня {n} раз", category: "mvp", icon: "star", metric: "mvpCount", tiers: [{ tier: 1, need: 1 }, { tier: 2, need: 3 }, { tier: 3, need: 10 }] },
  { code: "mvp_loss", title: "MVP в поражении", description: "Стать MVP дня, когда твоя команда проиграла серию", category: "mvp", icon: "star-half", metric: "mvpInLoss", tiers: SECRET, secret: true },
];

const DEF_BY_CODE = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));

export function achievementDef(code: string) {
  return DEF_BY_CODE[code] as AchievementDef | undefined;
}

export function tierDescription(def: AchievementDef, tier: Tier) {
  const t = def.tiers.find((x) => x.tier === tier) ?? def.tiers[0];
  if (t.label) return t.label;
  return def.description.replace("{n}", String(t.need));
}

/* ---------------- Статистика ---------------- */

function maxStreak(flags: boolean[]) {
  let best = 0;
  let cur = 0;
  for (const f of flags) {
    cur = f ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

const mskFmt = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
/** Номер календарного дня по Москве (для подсчёта серий) */
function mskDayNumber(date: Date) {
  const [y, m, d] = mskFmt.format(date).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Самая длинная серия подряд идущих дней */
function longestDayRun(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  for (let i = 0; i < sorted.length; i++) {
    cur = i > 0 && sorted[i] === sorted[i - 1] + 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

/** Общие данные для всех учеников (кэш на время одного прохода) */
type SharedData = {
  replays: { sessionId: string; radiantWin: boolean | null; data: unknown }[];
  materialsTotal: number;
  ratingById: Record<string, number>;
  sessionsById: Map<
    string,
    {
      radiantPlayerIds: string;
      direPlayerIds: string;
      teamAssignments: string;
      teamAssignmentsGame2: string | null;
      games: { gameNumber: number; winnerTeam: string }[];
    }
  >;
};

async function loadShared(): Promise<SharedData> {
  const [replays, materialsTotal, profiles, sessions] = await Promise.all([
    prisma.matchReplay.findMany({ select: { sessionId: true, radiantWin: true, data: true } }),
    prisma.learningMaterial.count(),
    prisma.playerProfile.findMany({ select: { userId: true, finalRating: true } }),
    prisma.matchSession.findMany({
      select: {
        id: true,
        radiantPlayerIds: true,
        direPlayerIds: true,
        teamAssignments: true,
        teamAssignmentsGame2: true,
        games: { select: { gameNumber: true, winnerTeam: true }, orderBy: { gameNumber: "asc" } },
      },
    }),
  ]);
  return {
    replays,
    materialsTotal,
    ratingById: Object.fromEntries(profiles.map((p) => [p.userId, p.finalRating])),
    sessionsById: new Map(sessions.map((s) => [s.id, s])),
  };
}

export async function computeAchievementStats(userId: string, shared?: SharedData): Promise<AchievementStats> {
  const now = new Date();
  const common = shared ?? (await loadShared());

  const [attendances, lessonSessions, excellent, assignments, participants, mvpSessions, diaryLogs, viewed] =
    await Promise.all([
      prisma.lessonAttendance.findMany({ where: { userId, present: true }, select: { sessionId: true } }),
      prisma.lessonSession.findMany({ where: { date: { lte: now } }, select: { id: true }, orderBy: { date: "asc" } }),
      prisma.homeworkSubmission.count({ where: { studentId: userId, excellent: true } }),
      prisma.homeworkAssignment.findMany({
        where: { studentId: userId },
        select: { deadline: true, createdAt: true, submission: { select: { submittedAt: true } } },
        orderBy: { deadline: "asc" },
      }),
      prisma.matchParticipant.findMany({
        where: { userId },
        select: {
          won: true,
          game: {
            select: {
              createdAt: true,
              gameNumber: true,
              sessionId: true,
              session: { select: { date: true, teamAssignments: true, teamAssignmentsGame2: true } },
            },
          },
        },
        orderBy: { game: { createdAt: "asc" } },
      }),
      prisma.matchSession.findMany({ where: { mvpWinnerId: userId }, select: { id: true } }),
      prisma.progressLog.findMany({ where: { userId }, select: { date: true, createdAt: true } }),
      prisma.materialView.count({ where: { userId } }),
    ]);

  // Занятия
  const attendedIds = new Set(attendances.map((a) => a.sessionId));
  const lessonStreak = maxStreak(lessonSessions.map((s) => attendedIds.has(s.id)));

  // Дневник: засчитываем день, только если запись создана в тот же день (по Москве)
  const diaryDays = diaryLogs
    .filter((l) => mskDayNumber(new Date(l.createdAt)) === mskDayNumber(new Date(l.date)))
    .map((l) => mskDayNumber(new Date(l.date)));
  const diaryStreak = longestDayRun(diaryDays);

  // Домашки
  const past = assignments.filter((a) => new Date(a.deadline) <= now);
  const onTimeFlags = past.map((a) =>
    Boolean(a.submission && new Date(a.submission.submittedAt) <= new Date(a.deadline))
  );
  let hwLastSecond = 0;
  let hwSpeedster = 0;
  for (const a of assignments) {
    if (!a.submission) continue;
    const sub = new Date(a.submission.submittedAt).getTime();
    const toDeadline = new Date(a.deadline).getTime() - sub;
    if (toDeadline >= 0 && toDeadline <= 10 * 60_000) hwLastSecond++;
    const sinceIssue = sub - new Date(a.createdAt).getTime();
    if (sinceIssue >= 0 && sinceIssue <= 60 * 60_000) hwSpeedster++;
  }

  // 5v5 — серия по капитанам G1 (как на табло), не по majority / личным W-L
  const wins = participants.filter((p) => p.won);
  const positions = new Set(
    wins
      .map((p) => positionForMatchGame(p.game.session, userId, p.game.gameNumber))
      .filter((pos) => pos > 0)
  );
  const bySession = new Map<string, { date: number; games: { n: number; won: boolean }[] }>();
  for (const p of participants) {
    const s = bySession.get(p.game.sessionId) ?? { date: new Date(p.game.session.date).getTime(), games: [] };
    s.games.push({ n: p.game.gameNumber, won: p.won });
    bySession.set(p.game.sessionId, s);
  }
  let comebacks = 0;
  const lostSeries = new Set<string>();
  const sessionsByDate = [...bySession.entries()].sort((a, b) => a[1].date - b[1].date);
  const sweepFlags: boolean[] = [];
  for (const [sid, { games }] of sessionsByDate) {
    games.sort((a, b) => a.n - b.n);
    const sess = common.sessionsById.get(sid);
    const side = sess ? playerG1Side(sess, userId) : null;
    const score = sess ? seriesScoreByGame1Roster(sess, common.ratingById) : null;
    const seriesWon =
      score && side
        ? side === "RADIANT"
          ? score.radiantWins > score.direWins
          : score.direWins > score.radiantWins
        : false;
    const seriesLost =
      score && side
        ? side === "RADIANT"
          ? score.direWins > score.radiantWins
          : score.radiantWins > score.direWins
        : false;
    const seriesSweep =
      score && side
        ? side === "RADIANT"
          ? score.radiantWins >= 2 && score.direWins === 0
          : score.direWins >= 2 && score.radiantWins === 0
        : false;
    // Камбэк: проиграл игру 1 и его именованная команда выиграла серию
    if (games.length >= 2 && !games[0].won && seriesWon) comebacks++;
    if (seriesLost) lostSeries.add(sid);
    sweepFlags.push(seriesSweep);
  }

  // Демки: ищем игрока по userId
  let immortal = 0;
  let butcher = 0;
  let angel = 0;
  let carried = 0;
  for (const r of common.replays) {
    const players = (r.data as ReplayData | null)?.players ?? [];
    const me = players.find((p) => p.userId === userId);
    if (!me) continue;
    if (me.kills >= 20) butcher++;
    if (me.assists >= 25) angel++;
    if (r.radiantWin == null) continue;
    const won = (me.team === "RADIANT") === r.radiantWin;
    if (won && me.deaths === 0) immortal++;
    const maxNw = Math.max(...players.map((p) => p.netWorth ?? 0));
    if (!won && me.netWorth > 0 && me.netWorth >= maxNw) carried++;
  }

  // MVP
  const mvpInLoss = mvpSessions.filter((s) => lostSeries.has(s.id)).length;

  return {
    lessonsAttended: attendedIds.size,
    lessonStreak,
    diaryStreak,
    hwExcellent: excellent,
    hwOnTimeStreak: maxStreak(onTimeFlags),
    hwLastSecond,
    hwSpeedster,
    bookworm: common.materialsTotal > 0 && viewed >= common.materialsTotal ? 1 : 0,
    matchesPlayed: participants.length,
    matchWinStreak: maxStreak(participants.map((p) => p.won)),
    winPositions: positions.size,
    comebacks,
    cleanSweepStreak: maxStreak(sweepFlags),
    immortal,
    butcher,
    angel,
    carried,
    mvpCount: mvpSessions.length,
    mvpInLoss,
    predictionsCorrect: await countCorrectPredictionDays(userId),
  };
}

/* ---------------- Запуск v2 (флаг в БД) ---------------- */

const LIVE_FLAG = "achievements_v2_live";
let liveCache = false;

export async function achievementsLive() {
  if (liveCache) return true;
  const flag = await prisma.appFlag.findUnique({ where: { key: LIVE_FLAG } }).catch(() => null);
  liveCache = flag?.value === "1";
  return liveCache;
}

/* ---------------- Выдача ---------------- */

export type UnlockedAchievement = {
  id: string;
  code: string;
  tier: Tier;
  title: string;
  description: string;
  icon: string;
  points: number;
  unlockedAt: string;
};

function toUnlocked(row: { id: string; code: string; tier: number; pointsAwarded: number; unlockedAt: Date }): UnlockedAchievement | null {
  const def = achievementDef(row.code);
  if (!def) return null;
  const tier = row.tier as Tier;
  return {
    id: row.id,
    code: row.code,
    tier,
    title: def.title,
    description: tierDescription(def, tier),
    icon: def.icon,
    points: row.pointsAwarded,
    unlockedAt: row.unlockedAt.toISOString(),
  };
}

/** Какие уровни открываются по статистике (без учёта уже выданных) */
function reachedTiers(stats: AchievementStats) {
  const out: { def: AchievementDef; tier: Tier }[] = [];
  for (const def of ACHIEVEMENTS) {
    const value = stats[def.metric];
    for (const t of def.tiers) if (value >= t.need) out.push({ def, tier: t.tier });
  }
  return out;
}

function pointsWord(n: number) {
  const s = String(n).replace(".", ",");
  return `+${s} очк.`;
}

function achievementLine(a: UnlockedAchievement) {
  const def = achievementDef(a.code);
  const tierName = def?.secret ? "секретная" : TIER_LABELS[a.tier];
  return `🏅 «${a.title}» — ${tierName}${a.points > 0 ? `, ${pointsWord(a.points)}` : ""}\n<i>${a.description}</i>`;
}

/** Сообщение в Telegram о новых ачивках */
async function notifyTelegram(userId: string, items: UnlockedAchievement[], summary = false) {
  if (!items.length) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true, telegramId: true },
  });
  const chatId = user ? notifyChatId(user) : null;
  if (!chatId) return;
  const link = absolutePublicUrl("/profile?tab=achievements");
  const head = summary
    ? `🎉 <b>Ачивки на СТАРТ+</b>\nМы пересчитали ачивки за всё время — у тебя открыто ${items.length}:`
    : items.length > 1
      ? `🎉 <b>Новые ачивки!</b>`
      : `🎉 <b>Новая ачивка!</b>`;
  const shown = items.slice(0, 15).map(achievementLine);
  const more = items.length > shown.length ? `\n…и ещё ${items.length - shown.length}` : "";
  const total = items.reduce((s, i) => s + i.points, 0);
  const totalLine = total > 0 ? `\n\nВсего: ${pointsWord(total)}` : "";
  const text = `${head}\n\n${shown.join("\n\n")}${more}${totalLine}${link ? `\n\n<a href="${link}">Все ачивки</a>` : ""}`;
  try {
    await sendTelegramMessage(chatId, text);
  } catch (e) {
    console.error("[achievements] telegram failed", e);
  }
}

/** Проверить и выдать новые ачивки. Возвращает только что открытые. */
export async function checkAchievements(userId: string, shared?: SharedData) {
  if (!(await achievementsLive())) return [];
  const [stats, existing] = await Promise.all([
    computeAchievementStats(userId, shared),
    prisma.userAchievement.findMany({ where: { userId }, select: { code: true, tier: true } }),
  ]);
  const have = new Set(existing.map((e) => `${e.code}:${e.tier}`));
  const created: UnlockedAchievement[] = [];

  for (const { def, tier } of reachedTiers(stats)) {
    if (have.has(`${def.code}:${tier}`)) continue;
    const points = TIER_POINTS[tier];
    try {
      const row = await prisma.userAchievement.create({
        data: { userId, code: def.code, tier, pointsAwarded: points },
      });
      if (points > 0) {
        await addPoints(userId, points, `Ачивка: «${def.title}» (${def.secret ? "секретная" : TIER_LABELS[tier]})`, {
          type: "ACHIEVEMENT",
          id: `${def.code}:${tier}`,
        });
      }
      const u = toUnlocked(row);
      if (u) created.push(u);
    } catch {
      // уже выдана параллельным запросом (unique) — пропускаем
    }
  }
  await notifyTelegram(userId, created);
  return created;
}

/* Не чаще раза в 2 минуты на ученика (один процесс на VPS) */
const lastCheck = new Map<string, number>();
const THROTTLE_MS = 2 * 60_000;

export async function checkAchievementsThrottled(userId: string) {
  const now = Date.now();
  if ((lastCheck.get(userId) ?? 0) > now - THROTTLE_MS) return;
  lastCheck.set(userId, now);
  try {
    await checkAchievements(userId);
  } catch (e) {
    console.error("[achievements] check failed", e);
  }
}

/** Ачивки, которые ученик ещё не видел (для окна с конфетти) */
export async function getUnseenAchievements(userId: string) {
  const rows = await prisma.userAchievement.findMany({
    where: { userId, seenAt: null },
    orderBy: { unlockedAt: "asc" },
  });
  return rows.map(toUnlocked).filter((x): x is UnlockedAchievement => x !== null);
}

export async function markAchievementsSeen(userId: string) {
  await prisma.userAchievement.updateMany({
    where: { userId, seenAt: null },
    data: { seenAt: new Date() },
  });
}

/* ---------------- Для профиля ---------------- */

export type AchievementTierView = {
  tier: Tier;
  need: number;
  description: string;
  done: boolean;
};

export type AchievementView = {
  code: string;
  title: string;
  category: AchievementCategory;
  icon: string;
  secret: boolean;
  /** Открытый уровень (0 — ничего) */
  tier: 0 | Tier;
  maxTier: Tier;
  /** Описание текущей цели (следующий уровень или последний открытый) */
  description: string;
  value: number;
  /** Порог следующего уровня (null — всё открыто) */
  nextNeed: number | null;
  nextTier: Tier | null;
  unlockedAt: string | null;
  /** Все уровни — для подсказки с прогрессом (у закрытых секретных пусто) */
  tiers: AchievementTierView[];
};

export async function getAchievementOverview(
  userId: string,
  { withStats = true, revealSecrets = true }: { withStats?: boolean; revealSecrets?: boolean } = {}
) {
  const [rows, stats] = await Promise.all([
    prisma.userAchievement.findMany({ where: { userId } }),
    withStats ? computeAchievementStats(userId) : Promise.resolve(null),
  ]);
  const known = rows.filter((r) => achievementDef(r.code));
  const unlockedBy = new Map<string, { tier: number; at: Date }>();
  for (const r of known) {
    const cur = unlockedBy.get(r.code);
    if (!cur || r.tier > cur.tier) unlockedBy.set(r.code, { tier: r.tier, at: r.unlockedAt });
  }
  const haveTier = new Set(known.map((r) => `${r.code}:${r.tier}`));

  const items: AchievementView[] = ACHIEVEMENTS.map((def) => {
    const got = unlockedBy.get(def.code);
    const tier = (got?.tier ?? 0) as 0 | Tier;
    const next = def.tiers.find((t) => t.tier > tier) ?? null;
    const maxTier = def.tiers[def.tiers.length - 1].tier;
    const descTier = (next?.tier ?? (tier || def.tiers[0].tier)) as Tier;
    // Условие секретной ачивки — только владельцу профиля (и только после получения / для своего прогресса)
    const hideCondition = Boolean(def.secret) && (tier === 0 || !revealSecrets);
    return {
      code: def.code,
      title: def.title,
      category: def.category,
      icon: def.icon,
      secret: Boolean(def.secret),
      tier,
      maxTier,
      description: hideCondition ? "" : tierDescription(def, descTier),
      value: hideCondition ? 0 : stats ? stats[def.metric] : 0,
      nextNeed: hideCondition ? null : next?.need ?? null,
      nextTier: hideCondition ? null : next?.tier ?? null,
      unlockedAt: got ? got.at.toISOString() : null,
      tiers: hideCondition
        ? []
        : def.tiers.map((t) => ({
            tier: t.tier,
            need: t.need,
            description: tierDescription(def, t.tier),
            done: haveTier.has(`${def.code}:${t.tier}`),
          })),
    };
  });

  const unlockedCount = known.length;
  const totalCount = ACHIEVEMENTS.reduce((s, a) => s + a.tiers.length, 0);
  const points = known.reduce((s, r) => s + r.pointsAwarded, 0);
  return { items, unlockedCount, totalCount, points };
}

/** Проверка для всех учеников (cron) */
export async function checkAllAchievements() {
  if (!(await achievementsLive())) return 0;
  const shared = await loadShared();
  const students = await prisma.user.findMany({ where: { role: "STUDENT" }, select: { id: true } });
  let unlocked = 0;
  for (const s of students) {
    try {
      unlocked += (await checkAchievements(s.id, shared)).length;
    } catch (e) {
      console.error("[achievements] cron failed for", s.id, e);
    }
  }
  return unlocked;
}

/* ---------------- Пересборка с нуля (админ) ---------------- */

export type RebuildRow = {
  userId: string;
  name: string;
  /** Очки, которые сейчас начислены за старые ачивки (будут сняты) */
  oldPoints: number;
  oldCount: number;
  unlocked: { code: string; title: string; tier: Tier; secret: boolean; points: number }[];
  points: number;
};

/**
 * Пересчитать ачивки всех учеников по всей истории.
 * apply=false — только отчёт (ничего не меняется).
 * apply=true — удалить все старые ачивки и их очки, выдать заново, прислать одно сводное сообщение в TG
 * и включить автоматическую выдачу. awardPoints — начислять ли очки за то, что открылось при пересборке.
 */
export async function rebuildAchievements({ apply, awardPoints }: { apply: boolean; awardPoints: boolean }) {
  const shared = await loadShared();
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
  const oldLogs = await prisma.pointLog.findMany({
    where: { sourceType: "ACHIEVEMENT" },
    select: { id: true, userId: true, delta: true },
  });
  const oldRows = await prisma.userAchievement.groupBy({ by: ["userId"], _count: { _all: true } });
  const oldCountBy = new Map(oldRows.map((r) => [r.userId, r._count._all]));
  const oldPointsBy = new Map<string, number>();
  for (const l of oldLogs) oldPointsBy.set(l.userId, (oldPointsBy.get(l.userId) ?? 0) + l.delta);

  const report: RebuildRow[] = [];
  for (const st of students) {
    const stats = await computeAchievementStats(st.id, shared);
    const unlocked = reachedTiers(stats).map(({ def, tier }) => ({
      code: def.code,
      title: def.title,
      tier,
      secret: Boolean(def.secret),
      points: TIER_POINTS[tier],
    }));
    report.push({
      userId: st.id,
      name: displayName(st),
      oldPoints: Math.round((oldPointsBy.get(st.id) ?? 0) * 100) / 100,
      oldCount: oldCountBy.get(st.id) ?? 0,
      unlocked,
      points: unlocked.reduce((s, u) => s + u.points, 0),
    });
  }
  report.sort((a, b) => b.points - a.points || b.unlocked.length - a.unlocked.length);

  if (!apply) return report;

  // 1. Снять старые очки за ачивки (и откатить totalPoints)
  for (const [userId, sum] of oldPointsBy) {
    if (!sum) continue;
    await prisma.playerProfile.updateMany({ where: { userId }, data: { totalPoints: { decrement: sum } } });
  }
  await prisma.pointLog.deleteMany({ where: { sourceType: "ACHIEVEMENT" } });
  // 2. Удалить все старые ачивки
  await prisma.userAchievement.deleteMany({});

  // 3. Выдать заново + одно сводное сообщение
  for (const row of report) {
    const created: UnlockedAchievement[] = [];
    for (const u of row.unlocked) {
      const def = achievementDef(u.code)!;
      const pts = awardPoints ? u.points : 0;
      const rec = await prisma.userAchievement.create({
        data: { userId: row.userId, code: u.code, tier: u.tier, pointsAwarded: pts },
      });
      if (pts > 0) {
        await addPoints(row.userId, pts, `Ачивка: «${def.title}» (${def.secret ? "секретная" : TIER_LABELS[u.tier]})`, {
          type: "ACHIEVEMENT",
          id: `${u.code}:${u.tier}`,
        });
      }
      const x = toUnlocked(rec);
      if (x) created.push(x);
    }
    await notifyTelegram(row.userId, created, true);
  }

  // 4. Включить автоматическую выдачу
  await prisma.appFlag.upsert({
    where: { key: LIVE_FLAG },
    create: { key: LIVE_FLAG, value: "1" },
    update: { value: "1" },
  });
  liveCache = true;
  return report;
}
