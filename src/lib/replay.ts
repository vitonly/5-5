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
  items: (string | null)[];
  backpack: (string | null)[];
  neutralItem: string | null;
};

export type ReplayData = { players: ReplayPlayer[] };

type RawPlayer = Partial<Record<string, unknown>>;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const nn = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Привести ответ парсера к нашему формату и подставить учеников по Steam ID */
export function normalizeReplayPlayers(
  raw: RawPlayer[],
  userByAccount: Map<number, string>
): ReplayPlayer[] {
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
      items: Array.from({ length: 6 }, (_, i) => items[i] ?? null),
      backpack,
      neutralItem: s(p.neutralItem),
    };
  });
}

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react";
const HEROES = (dota as { heroes: Record<string, { n: string; l: string }> }).heroes;
const ITEMS = (dota as { items: Record<string, { d: string; i: string }> }).items;

export function heroInfo(heroId: number | null) {
  const h = heroId != null ? HEROES[String(heroId)] : undefined;
  if (!h) return { name: "Неизвестный герой", img: null as string | null };
  return { name: h.l, img: `${CDN}/heroes/${h.n}.png` };
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
