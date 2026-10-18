import crypto from "crypto";
import { prisma } from "@/lib/db";
import { isAdminVkId } from "@/lib/session";
import { generateTelegramLinkToken } from "@/lib/telegram-links";

export { isAdminVkId };

const VK_AUTH_URL = "https://id.vk.ru/authorize";
const VK_TOKEN_URL = "https://id.vk.ru/oauth2/auth";
const VK_USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";
const VK_API_URL = "https://api.vk.com/method";

export const VK_OAUTH_COOKIE = {
  state: "vk_oauth_state",
  verifier: "vk_oauth_verifier",
  pdConsent: "vk_oauth_pd",
  redirectUri: "vk_oauth_redirect",
} as const;

export function isVkConfigured(): boolean {
  return Boolean(process.env.VK_CLIENT_ID || process.env.NEXT_PUBLIC_VK_CLIENT_ID);
}

export function getVkClientId(): string {
  return (process.env.VK_CLIENT_ID || process.env.NEXT_PUBLIC_VK_CLIENT_ID || "").trim();
}

/** PKCE: 43–128 chars from [A-Za-z0-9_-] */
export function createCodeVerifier(): string {
  return crypto.randomBytes(64).toString("base64url").slice(0, 64);
}

export function createCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function createOAuthState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildVkRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/auth/vk/callback`;
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    scope: "vkid.personal_info",
    lang_id: "0",
  });
  return `${VK_AUTH_URL}?${params.toString()}`;
}

export type VkCallbackPayload = {
  code: string;
  state: string;
  device_id: string;
};

/** Parse VK callback query: plain params or JSON `payload`. */
export function parseVkCallbackParams(
  searchParams: URLSearchParams
): VkCallbackPayload | null {
  const payloadRaw = searchParams.get("payload");
  if (payloadRaw) {
    try {
      const parsed = JSON.parse(payloadRaw) as Record<string, unknown>;
      const code = String(parsed.code || "");
      const state = String(parsed.state || "");
      const device_id = String(parsed.device_id || "");
      if (code && state && device_id) return { code, state, device_id };
    } catch {
      /* fall through */
    }
  }

  const code = searchParams.get("code") || "";
  const state = searchParams.get("state") || "";
  const device_id = searchParams.get("device_id") || "";
  if (code && state && device_id) return { code, state, device_id };
  return null;
}

export async function exchangeVkCode(opts: {
  code: string;
  codeVerifier: string;
  deviceId: string;
  redirectUri: string;
  state: string;
}): Promise<{ access_token: string; user_id: string; id_token?: string }> {
  const clientId = getVkClientId();
  if (!clientId) throw new Error("VK_CLIENT_ID not set");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: opts.codeVerifier,
    device_id: opts.deviceId,
    redirect_uri: opts.redirectUri,
    client_id: clientId,
    state: opts.state,
  });
  const secret = (process.env.VK_CLIENT_SECRET || "").trim();
  if (secret) body.set("client_secret", secret);

  const res = await fetch(VK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.access_token) {
    const err =
      typeof data.error_description === "string"
        ? data.error_description
        : typeof data.error === "string"
          ? data.error
          : `token_exchange_${res.status}`;
    throw new Error(err);
  }

  return {
    access_token: String(data.access_token),
    user_id: String(data.user_id ?? ""),
    id_token: data.id_token ? String(data.id_token) : undefined,
  };
}

export type VkUserInfo = {
  user_id: string;
  first_name: string;
  last_name?: string | null;
  avatar?: string | null;
};

export async function fetchVkUserInfo(accessToken: string): Promise<VkUserInfo> {
  const clientId = getVkClientId();
  const body = new URLSearchParams({
    access_token: accessToken,
    client_id: clientId,
  });
  const res = await fetch(VK_USER_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    user?: Record<string, unknown>;
    error?: string;
  };
  const user = data.user;
  if (!user?.user_id) {
    throw new Error(data.error || "user_info_failed");
  }
  return {
    user_id: String(user.user_id),
    first_name: String(user.first_name || "Игрок"),
    last_name: user.last_name ? String(user.last_name) : null,
    avatar: user.avatar ? String(user.avatar) : null,
  };
}

export type ParsedVkInput =
  | { kind: "id"; vkId: string; screenName?: string }
  | { kind: "screen"; screenName: string };

/** Accept numeric id, vk.com/idN, vk.com/nick, @nick. */
export function parseVkInput(raw: string): ParsedVkInput | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^@/, "");

  try {
    if (s.includes("://") || s.startsWith("vk.com") || s.startsWith("m.vk.com")) {
      const url = s.includes("://") ? new URL(s) : new URL(`https://${s}`);
      const host = url.hostname.replace(/^www\./, "");
      if (host === "vk.com" || host === "m.vk.com" || host === "vk.ru" || host === "m.vk.ru") {
        const path = url.pathname.replace(/^\//, "").split("/")[0] || "";
        s = path;
      }
    }
  } catch {
    /* keep s */
  }

  s = s.replace(/^@/, "").trim();
  if (!s) return null;

  const idMatch = s.match(/^id(\d+)$/i);
  if (idMatch) return { kind: "id", vkId: idMatch[1] };
  if (/^\d+$/.test(s)) return { kind: "id", vkId: s };

  if (!/^[A-Za-z0-9._]+$/.test(s)) return null;
  return { kind: "screen", screenName: s };
}

export async function resolveVkScreenName(
  screenName: string
): Promise<{ vkId: string; screenName: string } | null> {
  const token = (process.env.VK_SERVICE_TOKEN || "").trim();
  if (!token) {
    throw new Error("VK_SERVICE_TOKEN не задан — укажите числовой VK ID");
  }

  const params = new URLSearchParams({
    user_ids: screenName,
    access_token: token,
    v: "5.199",
    fields: "screen_name",
  });
  const res = await fetch(`${VK_API_URL}/users.get?${params.toString()}`, {
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    response?: Array<{ id: number; screen_name?: string }>;
    error?: { error_msg?: string };
  };
  if (data.error || !data.response?.[0]?.id) {
    return null;
  }
  const u = data.response[0];
  return {
    vkId: String(u.id),
    screenName: u.screen_name || screenName,
  };
}

/** Normalize admin/API input to canonical vkId (+ optional screen). */
export async function resolveVkInput(raw: string): Promise<{
  vkId: string;
  screenName: string | null;
}> {
  const parsed = parseVkInput(raw);
  if (!parsed) throw new Error("Некорректный VK профиль");

  if (parsed.kind === "id") {
    return { vkId: parsed.vkId, screenName: parsed.screenName ?? null };
  }

  const resolved = await resolveVkScreenName(parsed.screenName);
  if (!resolved) throw new Error("Не удалось найти пользователя VK по нику");
  return { vkId: resolved.vkId, screenName: resolved.screenName };
}

export async function upsertVkUser(
  info: VkUserInfo,
  opts?: { pdConsent?: boolean }
) {
  const vkId = String(info.user_id);
  if (!vkId) throw new Error("empty_vk_id");

  const isAdmin = isAdminVkId(vkId);
  const existing = await prisma.user.findUnique({
    where: { vkId },
    include: { profile: true },
  });

  if (existing) {
    const data: {
      firstName?: string;
      lastName?: string | null;
      photoUrl?: string | null;
      role?: "ADMIN" | "STUDENT";
      pdConsentAt?: Date;
    } = {
      firstName: info.first_name || existing.firstName,
      lastName: info.last_name ?? existing.lastName,
      photoUrl: info.avatar ?? existing.photoUrl,
    };
    if (isAdmin) data.role = "ADMIN";
    if (opts?.pdConsent && !existing.pdConsentAt) {
      data.pdConsentAt = new Date();
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data,
      include: { profile: true },
    });
    if (!user.profile) {
      await prisma.playerProfile.create({ data: { userId: user.id } });
    }
    return prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { profile: true },
    });
  }

  // Новые аккаунты через VK создаются только для тренера (ADMIN_VK_IDS)
  if (!isAdmin) return null;

  const user = await prisma.user.create({
    data: {
      vkId,
      firstName: info.first_name || "Игрок",
      lastName: info.last_name || null,
      photoUrl: info.avatar || null,
      role: "ADMIN",
      telegramLinkToken: generateTelegramLinkToken(),
      pdConsentAt: opts?.pdConsent ? new Date() : null,
      profile: { create: {} },
    },
    include: { profile: true },
  });

  return user;
}
