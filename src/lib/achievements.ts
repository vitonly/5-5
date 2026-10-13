import { prisma } from "@/lib/db";
import { addPoints, positionForMatchGame } from "@/lib/points";
import { hasIncompleteRoles } from "@/lib/secondary-roles";
import { APP_TIMEZONE } from "@/lib/utils";

/*
 * Ачивки СТАРТ+.
 * Считаются только события ПОСЛЕ запуска (ACHIEVEMENTS_SINCE) — «с нуля».
 * Уровни: 1 бронза (0 очков) · 2 серебро (+0.5) · 3 золото (+1).
 * Открытая ачивка хранится в UserAchievement и больше не отбирается.
 */

export const ACHIEVEMENTS_SINCE = new Date(
  process.env.ACHIEVEMENTS_SINCE || "2026-10-13T00:00:00+03:00"
);

export type Tier = 1 | 2 | 3;
export const TIER_POINTS: Record<Tier, number> = { 1: 0, 2: 0.5, 3: 1 };
export const TIER_LABELS: Record<Tier, string> = { 1: "бронза", 2: "серебро", 3: "золото" };

export type AchievementCategory = "lessons" | "homework" | "matches" | "mvp" | "rating" | "team";

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  lessons: "Занятия",
  homework: "Домашки",
  matches: "5v5",
  mvp: "MVP",
  rating: "Рейтинг",
  team: "Команда",
};

export type AchievementStats = {
  lessonsAttended: number;
  lessonStreak: number;
  hwExcellent: number;
  hwOnTimeStreak: number;
  hwNight: number;
  matchesPlayed: number;
  matchWins: number;
  matchWinStreak: number;
  winPositions: number;
  comebacks: number;
  mvpCount: number;
  seasonPodium: number;
  weeklyRise: number;
  votedAll: number;
  telegram: number;
  profileReady: number;
  diaryDays: number;
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
  tiers: { tier: Tier; need: number }[];
  secret?: boolean;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  // Занятия
  { code: "first_lesson", title: "Первый шаг", description: "Прийти на занятие", category: "lessons", icon: "footprints", metric: "lessonsAttended", tiers: [{ tier: 1, need: 1 }] },
  { code: "regular", title: "Завсегдатай", description: "Посетить {n} занятий", category: "lessons", icon: "calendar-check", metric: "lessonsAttended", tiers: [{ tier: 1, need: 10 }, { tier: 2, need: 25 }, { tier: 3, need: 50 }] },
  { code: "iron_streak", title: "Железная серия", description: "{n} занятий подряд без пропусков", category: "lessons", icon: "flame", metric: "lessonStreak", tiers: [{ tier: 1, need: 3 }, { tier: 2, need: 5 }, { tier: 3, need: 10 }] },
  { code: "diary", title: "Аналитик", description: "Заполнить дневник прогресса {n} дней", category: "lessons", icon: "notebook-pen", metric: "diaryDays", tiers: [{ tier: 1, need: 5 }, { tier: 2, need: 15 }, { tier: 3, need: 30 }] },

  // Домашки
  { code: "first_excellent", title: "Отличник", description: "Получить «отлично» за домашку", category: "homework", icon: "badge-check", metric: "hwExcellent", tiers: [{ tier: 1, need: 1 }] },
  { code: "perfectionist", title: "Перфекционист", description: "{n} домашек на «отлично»", category: "homework", icon: "sparkles", metric: "hwExcellent", tiers: [{ tier: 1, need: 5 }, { tier: 2, need: 15 }, { tier: 3, need: 30 }] },
  { code: "punctual", title: "Пунктуальный", description: "{n} домашек подряд сданы вовремя", category: "homework", icon: "alarm-clock-check", metric: "hwOnTimeStreak", tiers: [{ tier: 1, need: 3 }, { tier: 2, need: 5 }, { tier: 3, need: 10 }] },
  { code: "night_watch", title: "Ночной дозор", description: "Сдать домашку глубокой ночью", category: "homework", icon: "moon", metric: "hwNight", tiers: [{ tier: 1, need: 1 }], secret: true },

  // 5v5
  { code: "first_win", title: "Первая победа", description: "Выиграть игру 5v5", category: "matches", icon: "trophy", metric: "matchWins", tiers: [{ tier: 1, need: 1 }] },
  { code: "veteran", title: "Ветеран", description: "Сыграть {n} игр 5v5", category: "matches", icon: "swords", metric: "matchesPlayed", tiers: [{ tier: 1, need: 10 }, { tier: 2, need: 25 }, { tier: 3, need: 50 }] },
  { code: "win_streak", title: "Серия побед", description: "{n} побед подряд", category: "matches", icon: "zap", metric: "matchWinStreak", tiers: [{ tier: 1, need: 3 }, { tier: 2, need: 5 }, { tier: 3, need: 7 }] },
  { code: "universal", title: "Универсал", description: "Победы на {n} разных позициях", category: "matches", icon: "shuffle", metric: "winPositions", tiers: [{ tier: 2, need: 3 }, { tier: 3, need: 5 }] },
  { code: "comeback", title: "Камбэк", description: "Проиграть первую игру дня и выиграть серию", category: "matches", icon: "rotate-ccw", metric: "comebacks", tiers: [{ tier: 2, need: 1 }], secret: true },

  // MVP
  { code: "mvp", title: "MVP", description: "Стать MVP дня {n} раз", category: "mvp", icon: "star", metric: "mvpCount", tiers: [{ tier: 1, need: 1 }, { tier: 2, need: 3 }, { tier: 3, need: 10 }] },

  // Рейтинг
  { code: "podium", title: "Призёр сезона", description: "Попасть в топ-3 сезона (золото — чемпион)", category: "rating", icon: "medal", metric: "seasonPodium", tiers: [{ tier: 2, need: 1 }, { tier: 3, need: 2 }] },
  { code: "rise", title: "Рывок", description: "Подняться на {n}+ места за неделю", category: "rating", icon: "trending-up", metric: "weeklyRise", tiers: [{ tier: 1, need: 3 }, { tier: 2, need: 5 }] },

  // Команда
  { code: "fair_vote", title: "Честный голос", description: "Оценить всех тиммейтов в голосовании", category: "team", icon: "vote", metric: "votedAll", tiers: [{ tier: 1, need: 1 }] },
  { code: "connected", title: "На связи", description: "Подключить Telegram", category: "team", icon: "send", metric: "telegram", tiers: [{ tier: 1, need: 1 }] },
  { code: "ready", title: "Готов к бою", description: "Заполнить роли и поставить фото", category: "team", icon: "shield-check", metric: "profileReady", tiers: [{ tier: 1, need: 1 }] },
];

const DEF_BY_CODE = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));

export function achievementDef(code: string) {
  return DEF_BY_CODE[code] as AchievementDef | undefined;
}

export function tierDescription(def: AchievementDef, tier: Tier) {
  const t = def.tiers.find((x) => x.tier === tier) ?? def.tiers[0];
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

function mskHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: APP_TIMEZONE }).format(date)
  );
}

export async function computeAchievementStats(userId: string): Promise<AchievementStats> {
  const since = ACHIEVEMENTS_SINCE;
  const now = new Date();

  const [
    user,
    attendances,
    lessonSessions,
    excellent,
    assignments,
    submissions,
    participants,
    mvpCount,
    closedSeasons,
    snapshots,
    diaryDays,
    openSeason,
    studentsCount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        telegramChatId: true,
        photoUrl: true,
        profile: { select: { primaryRole: true, secondaryRole: true, secondaryRoles: true } },
      },
    }),
    prisma.lessonAttendance.findMany({
      where: { userId, present: true, session: { date: { gte: since } } },
      select: { sessionId: true },
    }),
    prisma.lessonSession.findMany({
      where: { date: { gte: since, lte: now } },
      select: { id: true },
      orderBy: { date: "asc" },
    }),
    prisma.homeworkSubmission.count({
      where: { studentId: userId, excellent: true, gradedAt: { gte: since } },
    }),
    prisma.homeworkAssignment.findMany({
      where: { studentId: userId, deadline: { gte: since, lte: now } },
      select: { deadline: true, status: true, submission: { select: { submittedAt: true } } },
      orderBy: { deadline: "asc" },
    }),
    prisma.homeworkSubmission.findMany({
      where: { studentId: userId, submittedAt: { gte: since } },
      select: { submittedAt: true },
    }),
    prisma.matchParticipant.findMany({
      where: { userId, game: { createdAt: { gte: since } } },
      select: {
        won: true,
        game: {
          select: {
            createdAt: true,
            gameNumber: true,
            sessionId: true,
            session: { select: { teamAssignments: true, teamAssignmentsGame2: true } },
          },
        },
      },
      orderBy: { game: { createdAt: "asc" } },
    }),
    prisma.matchSession.count({ where: { mvpWinnerId: userId, date: { gte: since } } }),
    prisma.ratingSeason.findMany({
      where: { closedAt: { gte: since } },
      select: { id: true },
    }),
    prisma.ratingSnapshot.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, place: true },
      orderBy: { date: "asc" },
    }),
    prisma.progressLog.count({ where: { userId, date: { gte: since } } }),
    prisma.ratingSeason.findFirst({ where: { status: "OPEN" }, select: { id: true } }),
    prisma.user.count({ where: { role: "STUDENT" } }),
  ]);

  // Занятия
  const attendedIds = new Set(attendances.map((a) => a.sessionId));
  const lessonStreak = maxStreak(lessonSessions.map((s) => attendedIds.has(s.id)));

  // Домашки: вовремя = сдано не позже дедлайна
  const onTimeFlags = assignments.map((a) =>
    Boolean(a.submission && new Date(a.submission.submittedAt) <= new Date(a.deadline))
  );
  const hwNight = submissions.filter((s) => {
    const h = mskHour(new Date(s.submittedAt));
    return h >= 0 && h < 5;
  }).length;

  // 5v5
  const wins = participants.filter((p) => p.won);
  const positions = new Set(
    wins
      .map((p) => positionForMatchGame(p.game.session, userId, p.game.gameNumber))
      .filter((pos) => pos > 0)
  );
  const bySession = new Map<string, { n: number; won: boolean }[]>();
  for (const p of participants) {
    const list = bySession.get(p.game.sessionId) ?? [];
    list.push({ n: p.game.gameNumber, won: p.won });
    bySession.set(p.game.sessionId, list);
  }
  let comebacks = 0;
  for (const games of bySession.values()) {
    games.sort((a, b) => a.n - b.n);
    const w = games.filter((g) => g.won).length;
    if (games.length >= 2 && !games[0].won && w > games.length - w) comebacks++;
  }

  // Призёр сезона
  let seasonPodium = 0;
  for (const s of closedSeasons) {
    const grouped = await prisma.pointLog.groupBy({
      by: ["userId"],
      where: { seasonId: s.id },
      _sum: { delta: true },
    });
    const ranked = grouped
      .map((g) => ({ userId: g.userId, sum: g._sum.delta ?? 0 }))
      .filter((g) => g.sum > 0)
      .sort((a, b) => b.sum - a.sum);
    const idx = ranked.findIndex((r) => r.userId === userId);
    if (idx === 0) seasonPodium = Math.max(seasonPodium, 2);
    else if (idx > 0 && idx < 3) seasonPodium = Math.max(seasonPodium, 1);
  }

  // Рывок: лучшее улучшение места за 7 дней по снимкам
  let weeklyRise = 0;
  for (let i = 0; i < snapshots.length; i++) {
    const a = snapshots[i];
    if (a.place == null) continue;
    for (let j = i + 1; j < snapshots.length; j++) {
      const b = snapshots[j];
      const days = (new Date(b.date).getTime() - new Date(a.date).getTime()) / 86_400_000;
      if (days > 7) break;
      if (b.place != null) weeklyRise = Math.max(weeklyRise, a.place - b.place);
    }
  }

  // Честный голос: в открытом голосовании оценил всех (сила + тильт)
  let votedAll = 0;
  if (openSeason && studentsCount > 1) {
    const [ratings, vibes] = await Promise.all([
      prisma.peerRating.count({ where: { seasonId: openSeason.id, raterId: userId, createdAt: { gte: since } } }),
      prisma.vibeVote.count({ where: { seasonId: openSeason.id, voterId: userId } }),
    ]);
    if (ratings >= studentsCount - 1 && vibes >= studentsCount - 1) votedAll = 1;
  }

  return {
    lessonsAttended: attendedIds.size,
    lessonStreak,
    hwExcellent: excellent,
    hwOnTimeStreak: maxStreak(onTimeFlags),
    hwNight,
    matchesPlayed: participants.length,
    matchWins: wins.length,
    matchWinStreak: maxStreak(participants.map((p) => p.won)),
    winPositions: positions.size,
    comebacks,
    mvpCount,
    seasonPodium,
    weeklyRise,
    votedAll,
    telegram: user?.telegramChatId ? 1 : 0,
    profileReady: user && user.photoUrl && !hasIncompleteRoles(user.profile) ? 1 : 0,
    diaryDays,
  };
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

/** Проверить и выдать новые ачивки. Возвращает только что открытые. */
export async function checkAchievements(userId: string) {
  const [stats, existing] = await Promise.all([
    computeAchievementStats(userId),
    prisma.userAchievement.findMany({ where: { userId }, select: { code: true, tier: true } }),
  ]);
  const have = new Set(existing.map((e) => `${e.code}:${e.tier}`));
  const created: UnlockedAchievement[] = [];

  for (const def of ACHIEVEMENTS) {
    const value = stats[def.metric];
    for (const t of def.tiers) {
      if (value < t.need || have.has(`${def.code}:${t.tier}`)) continue;
      const points = TIER_POINTS[t.tier];
      try {
        const row = await prisma.userAchievement.create({
          data: { userId, code: def.code, tier: t.tier, pointsAwarded: points },
        });
        if (points > 0) {
          await addPoints(userId, points, `Ачивка: «${def.title}» (${TIER_LABELS[t.tier]})`, {
            type: "ACHIEVEMENT",
            id: `${def.code}:${t.tier}`,
          });
        }
        const u = toUnlocked(row);
        if (u) created.push(u);
      } catch {
        // уже выдана параллельным запросом (unique) — пропускаем
      }
    }
  }
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
};

export async function getAchievementOverview(userId: string, { withStats = true } = {}) {
  const [rows, stats] = await Promise.all([
    prisma.userAchievement.findMany({ where: { userId } }),
    withStats ? computeAchievementStats(userId) : Promise.resolve(null),
  ]);
  const unlockedBy = new Map<string, { tier: number; at: Date }>();
  for (const r of rows) {
    const cur = unlockedBy.get(r.code);
    if (!cur || r.tier > cur.tier) unlockedBy.set(r.code, { tier: r.tier, at: r.unlockedAt });
  }

  const items: AchievementView[] = ACHIEVEMENTS.map((def) => {
    const got = unlockedBy.get(def.code);
    const tier = (got?.tier ?? 0) as 0 | Tier;
    const next = def.tiers.find((t) => t.tier > tier) ?? null;
    const maxTier = def.tiers[def.tiers.length - 1].tier;
    const descTier = (next?.tier ?? tier ?? def.tiers[0].tier) as Tier;
    return {
      code: def.code,
      title: def.title,
      category: def.category,
      icon: def.icon,
      secret: Boolean(def.secret),
      tier,
      maxTier,
      description: tierDescription(def, descTier || def.tiers[0].tier),
      value: stats ? stats[def.metric] : 0,
      nextNeed: next?.need ?? null,
      nextTier: next?.tier ?? null,
      unlockedAt: got ? got.at.toISOString() : null,
    };
  });

  const unlockedCount = rows.length;
  const totalCount = ACHIEVEMENTS.reduce((s, a) => s + a.tiers.length, 0);
  const points = rows.reduce((s, r) => s + r.pointsAwarded, 0);
  return { items, unlockedCount, totalCount, points };
}

/** Проверка для всех учеников (cron) */
export async function checkAllAchievements() {
  const students = await prisma.user.findMany({ where: { role: "STUDENT" }, select: { id: true } });
  let unlocked = 0;
  for (const s of students) {
    try {
      unlocked += (await checkAchievements(s.id)).length;
    } catch (e) {
      console.error("[achievements] cron failed for", s.id, e);
    }
  }
  return unlocked;
}
