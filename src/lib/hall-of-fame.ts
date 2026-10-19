import { prisma } from "@/lib/db";
import { addPoints, getActiveSeasonId, positionForMatchGame } from "@/lib/points";
import { notifyChatId, sendTelegramMessage, absolutePublicUrl } from "@/lib/telegram";
import { heroInfo, type ReplayData, type ReplayPlayer } from "@/lib/replay";

/*
 * Зал славы 5v5 — рекорды по загруженным демкам.
 * Роль из состава на ту игру: позиции 1–3 — кор, 4–5 — саппорт.
 * Сезонный рекорд: +1.5 очка держателю (антирекорд −1.5). Перебили — очки переходят новому держателю.
 * Рекорды «за всё время» — только почёт, без очков.
 * Равенство — рекорд остаётся за тем, кто поставил его первым.
 */

export const HALL_POINTS = 1.5;

export type HallGroup = "core" | "support" | "general" | "anti";
type Role = "core" | "support";

export const HALL_GROUP_LABELS: Record<HallGroup, string> = {
  core: "Кор · позиции 1–3",
  support: "Саппорт · позиции 4–5",
  general: "Общие",
  anti: "Антирекорды",
};

type Ctx = { p: ReplayPlayer; role: Role; earlyDeaths: number | null };

export type Nomination = {
  code: string;
  title: string;
  group: HallGroup;
  role: Role | "any";
  /** null — у игрока нет данных (старая демка) */
  value: (c: Ctx) => number | null;
  format?: "k" | "sec" | "kda";
  unit?: string;
};

const pos = (v: number | null | undefined) => (v != null && v > 0 ? v : null);

export const NOMINATIONS: Nomination[] = [
  { code: "core_kills", title: "Больше всего убийств", group: "core", role: "core", value: ({ p }) => pos(p.kills) },
  { code: "core_networth", title: "Самый большой нетворс", group: "core", role: "core", value: ({ p }) => pos(p.netWorth), format: "k" },
  { code: "core_lasthits", title: "Больше всего добиваний", group: "core", role: "core", value: ({ p }) => pos(p.lastHits) },
  { code: "core_herodmg", title: "Больше всего урона по героям", group: "core", role: "core", value: ({ p }) => pos(p.heroDamage), format: "k" },
  { code: "core_towerdmg", title: "Больше всего урона по зданиям", group: "core", role: "core", value: ({ p }) => pos(p.towerDamage), format: "k" },

  { code: "sup_assists", title: "Больше всего ассистов", group: "support", role: "support", value: ({ p }) => pos(p.assists) },
  { code: "sup_stacks", title: "Лучший стакер", group: "support", role: "support", value: ({ p }) => pos(p.campsStacked) },
  { code: "sup_dewards", title: "Больше всего сломанных вардов", group: "support", role: "support", value: ({ p }) => (p.obsKilled == null && p.senKilled == null ? null : pos((p.obsKilled ?? 0) + (p.senKilled ?? 0))) },
  { code: "sup_stuns", title: "Больше всего станов", group: "support", role: "support", value: ({ p }) => pos(p.stuns != null ? Math.round(p.stuns * 10) / 10 : null), format: "sec" },
  { code: "sup_healing", title: "Больше всего лечения союзников", group: "support", role: "support", value: ({ p }) => pos(p.healing), format: "k" },

  {
    code: "kda",
    title: "Лучший KDA за игру",
    group: "general",
    role: "any",
    value: ({ p }) => (p.kills + p.assists >= 10 ? Math.round(((p.kills + p.assists) / Math.max(1, p.deaths)) * 10) / 10 : null),
    format: "kda",
  },
  { code: "tank", title: "Главный танк — больше всего полученного урона", group: "general", role: "any", value: ({ p }) => pos(p.damageTaken), format: "k" },

  { code: "anti_core_deaths", title: "Больше всего смертей у кора", group: "anti", role: "core", value: ({ p }) => pos(p.deaths) },
  { code: "anti_sup_deaths", title: "Больше всего смертей у саппорта", group: "anti", role: "support", value: ({ p }) => pos(p.deaths) },
  { code: "anti_early", title: "Тяжёлое начало — смертей за первые 10 минут", group: "anti", role: "any", value: ({ earlyDeaths }) => pos(earlyDeaths) },
];

const NOM_BY_CODE = new Map(NOMINATIONS.map((n) => [n.code, n]));

export type HallRecord = {
  code: string;
  title: string;
  group: HallGroup;
  value: number;
  display: string;
  userId: string;
  heroId: number | null;
  sessionId: string;
  gameNumber: number;
  date: string;
  /** Предыдущий держатель (для «побил рекорд …») */
  previous: { userId: string; value: number; display: string } | null;
};

export function formatHallValue(n: Nomination, v: number) {
  if (n.format === "k") return v >= 1000 ? `${(v / 1000).toFixed(1).replace(".0", "")}k` : String(v);
  if (n.format === "sec") return `${v.toFixed(v >= 100 ? 0 : 1).replace(".0", "")} с`;
  if (n.format === "kda") return v.toFixed(1).replace(".0", "");
  return n.unit ? `${v} ${n.unit}` : String(v);
}

/** Рекорды по демкам; seasonFrom — только игры с этой даты (сезон), иначе за всё время */
export async function computeHall(opts: { from?: Date | null; to?: Date | null } = {}) {
  const replays = await prisma.matchReplay.findMany({
    where: opts.from ? { session: { date: { gte: opts.from, ...(opts.to ? { lte: opts.to } : {}) } } } : undefined,
    select: {
      sessionId: true,
      gameNumber: true,
      data: true,
      session: { select: { date: true, teamAssignments: true, teamAssignmentsGame2: true } },
    },
  });
  // Хронологически: равенство — за тем, кто первым
  replays.sort((a, b) => +new Date(a.session.date) - +new Date(b.session.date) || a.gameNumber - b.gameNumber);

  const best = new Map<string, HallRecord>();
  for (const r of replays) {
    const data = r.data as ReplayData | null;
    const kills = data?.kills ?? null;
    for (const p of data?.players ?? []) {
      if (!p.userId) continue;
      const position = positionForMatchGame(r.session, p.userId, r.gameNumber);
      if (!position) continue;
      const role: Role = position <= 3 ? "core" : "support";
      const earlyDeaths =
        kills && p.heroUnit ? kills.filter((k) => k.victim === p.heroUnit && k.t >= 0 && k.t <= 600).length : null;
      for (const n of NOMINATIONS) {
        if (n.role !== "any" && n.role !== role) continue;
        const v = n.value({ p, role, earlyDeaths });
        if (v == null) continue;
        const cur = best.get(n.code);
        if (cur && v <= cur.value) continue;
        best.set(n.code, {
          code: n.code,
          title: n.title,
          group: n.group,
          value: v,
          display: formatHallValue(n, v),
          userId: p.userId,
          heroId: p.heroId,
          sessionId: r.sessionId,
          gameNumber: r.gameNumber,
          date: new Date(r.session.date).toISOString(),
          previous: cur && cur.userId !== p.userId ? { userId: cur.userId, value: cur.value, display: cur.display } : cur?.previous ?? null,
        });
      }
    }
  }
  return NOMINATIONS.map((n) => best.get(n.code) ?? null);
}

async function activeSeason() {
  const id = await getActiveSeasonId();
  if (!id) return null;
  return prisma.ratingSeason.findUnique({ where: { id }, select: { id: true, openedAt: true, closedAt: true, createdAt: true } });
}

export async function getSeasonHall() {
  const season = await activeSeason();
  if (!season) return { season: null, records: NOMINATIONS.map(() => null) as (HallRecord | null)[] };
  return { season, records: await computeHall({ from: season.openedAt ?? season.createdAt }) };
}

const SOURCE = "HALL_OF_FAME";

/**
 * Привести очки за сезонные рекорды к текущим держателям.
 * Вызывается после загрузки/удаления демки и по крону. Идемпотентно.
 */
export async function syncHallPoints() {
  const { season, records } = await getSeasonHall();
  if (!season) return { changed: 0 };
  const logs = await prisma.pointLog.findMany({
    where: { sourceType: SOURCE, seasonId: season.id },
    select: { userId: true, sourceId: true },
  });
  const holderNow = new Map<string, string>(); // sourceId → userId с очками
  for (const l of logs) if (l.sourceId) holderNow.set(l.sourceId, l.userId);

  let changed = 0;
  for (let i = 0; i < NOMINATIONS.length; i++) {
    const n = NOMINATIONS[i];
    const rec = records[i];
    const sourceId = `${season.id}:${n.code}`;
    const had = holderNow.get(sourceId) ?? null;
    const want = rec?.userId ?? null;
    if (had === want) continue;
    changed++;
    const anti = n.group === "anti";
    if (had) {
      // Старое начисление оставляем в истории, но снимаем с учёта держателя
      await prisma.pointLog.updateMany({
        where: { userId: had, sourceType: SOURCE, sourceId },
        data: { sourceType: "HALL_OF_FAME_PAST" },
      });
      await addPoints(
        had,
        anti ? HALL_POINTS : -HALL_POINTS,
        anti
          ? `Антирекорд: «${n.title}» перешёл к другому — очки вернулись`
          : `Зал славы: рекорд «${n.title}» побили`,
        { type: "HALL_OF_FAME_LOSS", id: `${sourceId}:lost:${Date.now()}` }
      );
      await notify(had, anti
        ? `😮‍💨 Антирекорд «${n.title}» перешёл к другому игроку — ${HALL_POINTS} очка вернулись.`
        : `⚔️ Твой рекорд «${n.title}» побили — −${HALL_POINTS} очка. Время вернуть его!`);
    }
    if (want && rec) {
      await addPoints(
        want,
        anti ? -HALL_POINTS : HALL_POINTS,
        `${anti ? "Антирекорд" : "Зал славы"}: «${n.title}» — ${rec.display}`,
        { type: SOURCE, id: sourceId }
      );
      const hero = heroInfo(rec.heroId).name;
      await notify(want, anti
        ? `💀 Антирекорд сезона «${n.title}» — ${rec.display} (${hero}). −${HALL_POINTS} очка, пока кто-то не превзойдёт.`
        : `🏆 Ты в Зале славы! «${n.title}» — ${rec.display} на ${hero}. +${HALL_POINTS} очка, пока рекорд держится.`);
    }
  }
  return { changed };
}

async function notify(userId: string, text: string) {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, telegramId: true } });
    const chatId = u ? notifyChatId(u) : null;
    if (!chatId) return;
    const link = absolutePublicUrl("/hall");
    await sendTelegramMessage(chatId, link ? `${text}\n\n<a href="${link}">Зал славы</a>` : text);
  } catch (e) {
    console.error("[hall] notify failed", e);
  }
}

export function nominationByCode(code: string) {
  return NOM_BY_CODE.get(code);
}
