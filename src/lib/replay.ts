import dota from "@/lib/dota-data.json";

/* Демки 5v5: формат данных, который сохраняем в MatchReplay.data, и справочники Dota */

export type ReplayPlayer = {
  team: "RADIANT" | "DIRE";
  accountId: number | null;
  userId: string | null;
  name: string | null;
  heroId: number | null;
  level: number | null;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  heroDamage: number;
  towerDamage: number;
  healing: number;
  /** Золото / опыт в минуту (нет в старых демках) */
  gpm?: number | null;
  xpm?: number | null;
  items: (string | null)[];
  backpack: (string | null)[];
  neutralItem: string | null;
  /* Расширенные поля (новый парсер; в старых демках их нет) */
  heroUnit?: string | null;
  damageTaken?: number | null;
  stuns?: number | null;
  campsStacked?: number | null;
  runePickups?: number | null;
  obsPlaced?: number | null;
  senPlaced?: number | null;
  obsKilled?: number | null;
  senKilled?: number | null;
  towerKills?: number | null;
  roshanKills?: number | null;
  buybacks?: number | null;
  maxMultiKill?: number | null;
  maxKillStreak?: number | null;
  /** Покупки: секунда игры → предмет */
  purchases?: { t: number; item: string }[];
  /** Нетворс / опыт по минутам */
  nwTimeline?: number[];
  xpTimeline?: number[];
};

export type KillEvent = { t: number; killer: string | null; victim: string };

export type DraftEntry = {
  order: number;
  heroId: number;
  pick: boolean;
  team: "RADIANT" | "DIRE" | null;
};

export type ReplayData = { players: ReplayPlayer[]; draft?: DraftEntry[]; kills?: KillEvent[] };

type RawPlayer = Partial<Record<string, unknown>>;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const nn = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown) => (typeof v === "string" && v ? v : null);

const numArr = (v: unknown) => (Array.isArray(v) ? v.map(n) : undefined);

/** Лог убийств героев */
export function normalizeKills(raw: unknown): KillEvent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .map((k) => ({ t: n(k.t), killer: s(k.killer), victim: s(k.victim) ?? "" }))
    .filter((k) => k.victim);
}

/** Когда куплен предмет (последняя покупка до конца игры), «мм:сс» */
export function purchaseTime(p: ReplayPlayer, item: string | null) {
  if (!item || !p.purchases?.length) return null;
  const hits = p.purchases.filter((x) => x.item === item);
  if (!hits.length) return null;
  return formatDuration(Math.max(0, hits[hits.length - 1].t));
}

/** Разница нетворса команд по минутам (плюс — в пользу Света) */
export function networthAdvantage(players: ReplayPlayer[]) {
  const len = Math.max(0, ...players.map((p) => p.nwTimeline?.length ?? 0));
  const out: number[] = [];
  for (let m = 0; m < len; m++) {
    let diff = 0;
    for (const p of players) {
      const v = p.nwTimeline?.[Math.min(m, (p.nwTimeline?.length ?? 1) - 1)] ?? 0;
      diff += p.team === "RADIANT" ? v : -v;
    }
    out.push(diff);
  }
  return out;
}

/** Привести ответ парсера к нашему формату и подставить учеников по Steam ID */
export function normalizeReplayPlayers(
  raw: RawPlayer[],
  userByAccount: Map<number, string>,
  durationSec = 0
): ReplayPlayer[] {
  const minutes = durationSec > 0 ? durationSec / 60 : 0;
  return raw.map((p) => {
    const accountId = nn(p.accountId);
    const items = Array.isArray(p.items) ? (p.items as unknown[]).map(s) : [];
    const backpack = Array.isArray(p.backpack) ? (p.backpack as unknown[]).map(s) : [];
    return {
      team: p.team === "DIRE" ? "DIRE" : "RADIANT",
      accountId,
      userId: accountId != null ? (userByAccount.get(accountId) ?? null) : null,
      name: s(p.name),
      heroId: nn(p.heroId),
      level: nn(p.level),
      kills: n(p.kills),
      deaths: n(p.deaths),
      assists: n(p.assists),
      netWorth: n(p.netWorth),
      lastHits: n(p.lastHits),
      denies: n(p.denies),
      heroDamage: n(p.heroDamage),
      towerDamage: n(p.towerDamage),
      healing: n(p.healing),
      gpm: minutes && typeof p.totalGold === "number" ? Math.round(p.totalGold / minutes) : null,
      xpm: minutes && typeof p.totalXp === "number" ? Math.round(p.totalXp / minutes) : null,
      items: Array.from({ length: 6 }, (_, i) => items[i] ?? null),
      backpack,
      neutralItem: s(p.neutralItem),
      heroUnit: s(p.heroUnit),
      damageTaken: nn(p.damageTaken),
      stuns: nn(p.stuns),
      campsStacked: nn(p.campsStacked),
      runePickups: nn(p.runePickups),
      obsPlaced: nn(p.obsPlaced),
      senPlaced: nn(p.senPlaced),
      obsKilled: nn(p.obsKilled),
      senKilled: nn(p.senKilled),
      towerKills: nn(p.towerKills),
      roshanKills: nn(p.roshanKills),
      buybacks: nn(p.buybacks),
      maxMultiKill: nn(p.maxMultiKill),
      maxKillStreak: nn(p.maxKillStreak),
      purchases: Array.isArray(p.purchases)
        ? (p.purchases as Record<string, unknown>[])
            .map((x) => ({ t: n(x.t), item: s(x.item) ?? "" }))
            .filter((x) => x.item)
        : undefined,
      nwTimeline: numArr(p.nwTimeline),
      xpTimeline: numArr(p.xpTimeline),
    };
  });
}

/** Драфт из парсера; у пиков сторону берём по герою игрока, если парсер её не знал */
export function normalizeDraft(raw: unknown, players: ReplayPlayer[]): DraftEntry[] {
  if (!Array.isArray(raw)) return [];
  const sideByHero = new Map(players.filter((p) => p.heroId).map((p) => [p.heroId as number, p.team]));
  return (raw as Record<string, unknown>[])
    .map((d, i) => {
      const heroId = nn(d.heroId);
      if (!heroId) return null;
      const pick = d.pick === true;
      const team = d.team === "RADIANT" || d.team === "DIRE" ? d.team : null;
      return {
        order: nn(d.order) ?? i + 1,
        heroId,
        pick,
        team: (pick ? (sideByHero.get(heroId) ?? team) : team) as DraftEntry["team"],
      };
    })
    .filter((x): x is DraftEntry => x !== null)
    .sort((a, b) => a.order - b.order);
}

/** Предметы без пустых слотов: всё прижато влево */
export function packItems(items: (string | null)[]) {
  return items.filter((x): x is string => Boolean(x));
}

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react";
const HEROES = (dota as { heroes: Record<string, { n: string; l: string }> }).heroes;
const ITEMS = (dota as { items: Record<string, { d: string; i: string }> }).items;

export function heroInfo(heroId: number | null) {
  const h = heroId != null ? HEROES[String(heroId)] : undefined;
  if (!h) return { name: "Неизвестный герой", img: null as string | null, icon: null as string | null };
  // crops ≈400×250 — чётче на карточках; обычные heroes/*.png всего 256×144 и мылятся
  return {
    name: h.l,
    img: `${CDN}/heroes/crops/${h.n}.png`,
    icon: `${CDN}/heroes/${h.n}.png`,
  };
}

/** item_blink → «Blink Dagger» + картинка */
export function itemInfo(raw: string | null) {
  if (!raw) return null;
  const key = raw.replace(/^item_/, "");
  const it = ITEMS[key];
  return {
    name: it?.d ?? key.replace(/_/g, " "),
    img: it?.i ? `${CDN}/items/${it.i}` : `${CDN}/items/${key}.png`,
  };
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

export function formatK(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1).replace(".0", "")}k` : String(v);
}

/** Склонение: 1 игра, 2 игры, 5 игр */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
