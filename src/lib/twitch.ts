interface TwitchStream {
  user_login: string;
  user_name: string;
  title: string;
  viewer_count: number;
  thumbnail_url: string;
  game_name: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

const LIVE_CACHE_TTL_MS = 45_000;
const LIVE_BUDGET_MS = 1_800;
const HELIX_TIMEOUT_MS = 1_600;
const DECAPI_TIMEOUT_MS = 1_200;

type LiveCache = { key: string; at: number; streams: LiveStream[] };
let liveCache: LiveCache | null = null;
let liveInflight: { key: string; promise: Promise<LiveStream[]> } | null = null;

async function getAppToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST", signal: AbortSignal.timeout(HELIX_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export function extractTwitchLogin(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (match) return match[1].toLowerCase();
  if (/^[a-zA-Z0-9_]+$/.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export interface LiveStream {
  login: string;
  name: string;
  title: string;
  viewers: number;
  thumbnailUrl: string;
  game: string;
  url: string;
}

function cacheKey(logins: string[]): string {
  return [...logins].sort().join(",");
}

async function fetchLiveStreamsFresh(unique: string[]): Promise<LiveStream[]> {
  const hasHelix = Boolean(
    process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim()
  );

  if (hasHelix) {
    const viaHelix = await getLiveStreamsViaHelix(unique);
    if (viaHelix !== null) return viaHelix;
    // Helix недоступен (часто сеть VPS) — не блокируем страницу DecAPI
    return [];
  }

  return getLiveStreamsViaDecapi(unique);
}

/**
 * Быстрый путь для SSR: кэш / stale, жёсткий бюджет ~1.8s.
 * Не держит белый экран на таймаутах Twitch.
 */
export async function getLiveStreams(logins: string[]): Promise<LiveStream[]> {
  const unique = Array.from(new Set(logins.map((l) => l.toLowerCase())));
  if (unique.length === 0) return [];

  const key = cacheKey(unique);
  const now = Date.now();

  if (liveCache && liveCache.key === key && now - liveCache.at < LIVE_CACHE_TTL_MS) {
    return liveCache.streams;
  }

  const stale = liveCache && liveCache.key === key ? liveCache.streams : null;

  if (!liveInflight || liveInflight.key !== key) {
    const promise = fetchLiveStreamsFresh(unique)
      .then((streams) => {
        liveCache = { key, at: Date.now(), streams };
        return streams;
      })
      .finally(() => {
        if (liveInflight?.key === key) liveInflight = null;
      });
    liveInflight = { key, promise };
  }

  // Есть stale — отдаём сразу, обновление в фоне
  if (stale) {
    void liveInflight.promise;
    return stale;
  }

  try {
    return await Promise.race([
      liveInflight.promise,
      new Promise<LiveStream[]>((resolve) =>
        setTimeout(() => resolve([]), LIVE_BUDGET_MS)
      ),
    ]);
  } catch {
    return [];
  }
}

async function getLiveStreamsViaHelix(logins: string[]): Promise<LiveStream[] | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await getAppToken();
  if (!clientId || !token) return null;

  const results: LiveStream[] = [];

  for (let i = 0; i < logins.length; i += 100) {
    const batch = logins.slice(i, i + 100);
    const params = batch.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
    try {
      const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
        headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(HELIX_TIMEOUT_MS),
      });
      if (res.status === 401) {
        cachedToken = null;
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      for (const s of data.data as TwitchStream[]) {
        results.push({
          login: s.user_login,
          name: s.user_name,
          title: s.title,
          viewers: s.viewer_count,
          thumbnailUrl: s.thumbnail_url.replace("{width}", "440").replace("{height}", "248"),
          game: s.game_name,
          url: `https://twitch.tv/${s.user_login}`,
        });
      }
    } catch {
      return null;
    }
  }

  return results.sort((a, b) => b.viewers - a.viewers);
}

/** Без ключей Twitch — через публичный decapi.me (запасной вариант) */
async function getLiveStreamsViaDecapi(logins: string[]): Promise<LiveStream[]> {
  const results: LiveStream[] = [];
  // небольшая параллельность + короткий таймаут, чтобы не ловить 429 и не висеть
  const concurrency = 3;
  for (let i = 0; i < logins.length; i += concurrency) {
    const chunk = logins.slice(i, i + concurrency);
    const part = await Promise.all(chunk.map(checkDecapiLive));
    for (const live of part) {
      if (live) results.push(live);
    }
  }
  return results.sort((a, b) => b.viewers - a.viewers);
}

function isDecapiJunk(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    /^429\b/i.test(t) ||
    /too many requests/i.test(t) ||
    /thou shall not pass/i.test(t) ||
    /error occurred/i.test(t) ||
    /rate.?limit/i.test(t) ||
    /unavailable/i.test(t) ||
    t.startsWith("{")
  );
}

/** Uptime живого канала: "3 hours, 12 minutes, 5 seconds" и т.п. */
function isDecapiLiveUptime(uptime: string): boolean {
  if (isDecapiJunk(uptime) || /is offline/i.test(uptime)) return false;
  return /\b(seconds?|minutes?|hours?|days?|secs?|mins?|hrs?)\b/i.test(uptime);
}

async function decapiText(path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://decapi.me/twitch/${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(DECAPI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (isDecapiJunk(text)) return null;
    return text;
  } catch {
    return null;
  }
}

async function checkDecapiLive(login: string): Promise<LiveStream | null> {
  try {
    const uptime = await decapiText(`uptime/${encodeURIComponent(login)}`);
    if (!uptime || !isDecapiLiveUptime(uptime)) return null;

    const [viewersText, title] = await Promise.all([
      decapiText(`viewercount/${encodeURIComponent(login)}`),
      decapiText(`title/${encodeURIComponent(login)}`),
    ]);

    if (title !== null && isDecapiJunk(title)) return null;

    let viewers = 0;
    if (viewersText && !/is offline/i.test(viewersText)) {
      const n = parseInt(viewersText, 10);
      if (!Number.isNaN(n)) viewers = n;
    }

    return {
      login,
      name: login,
      title: title && !isDecapiJunk(title) ? title : "В эфире",
      viewers,
      thumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-440x248.jpg`,
      game: "",
      url: `https://twitch.tv/${login}`,
    };
  } catch {
    return null;
  }
}
