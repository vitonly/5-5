interface TwitchStream {
  user_login: string;
  user_name: string;
  title: string;
  viewer_count: number;
  thumbnail_url: string;
  game_name: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

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
      { method: "POST" }
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

export async function getLiveStreams(logins: string[]): Promise<LiveStream[]> {
  const unique = Array.from(new Set(logins.map((l) => l.toLowerCase())));
  if (unique.length === 0) return [];

  const viaHelix = await getLiveStreamsViaHelix(unique);
  if (viaHelix !== null) return viaHelix;

  return getLiveStreamsViaDecapi(unique);
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
        next: { revalidate: 60 },
      });
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
  const results = await Promise.all(logins.map(checkDecapiLive));
  return results.filter((r): r is LiveStream => r !== null).sort((a, b) => b.viewers - a.viewers);
}

async function decapiText(path: string): Promise<string> {
  const res = await fetch(`https://decapi.me/twitch/${path}`, { next: { revalidate: 60 } });
  return (await res.text()).trim();
}

async function checkDecapiLive(login: string): Promise<LiveStream | null> {
  try {
    const uptime = await decapiText(`uptime/${encodeURIComponent(login)}`);
    if (/is offline/i.test(uptime)) return null;

    const [viewersText, title] = await Promise.all([
      decapiText(`viewercount/${encodeURIComponent(login)}`),
      decapiText(`title/${encodeURIComponent(login)}`),
    ]);

    let viewers = 0;
    if (!/is offline/i.test(viewersText)) {
      const n = parseInt(viewersText, 10);
      if (!Number.isNaN(n)) viewers = n;
    }

    return {
      login,
      name: login,
      title: title || "В эфире",
      viewers,
      thumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-440x248.jpg`,
      game: "",
      url: `https://twitch.tv/${login}`,
    };
  } catch {
    return null;
  }
}
