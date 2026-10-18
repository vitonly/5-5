import { NextRequest, NextResponse } from "next/server";
import { setSessionCookieOnResponse } from "@/lib/session";
import {
  exchangeVkCode,
  fetchVkUserInfo,
  parseVkCallbackParams,
  upsertVkUser,
  VK_OAUTH_COOKIE,
} from "@/lib/vk-auth";

function appUrlFromRequest(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (host ? `${proto}://${host}` : request.nextUrl.origin)
  ).replace(/\/$/, "");
}

function clearOauthCookies(response: NextResponse) {
  for (const name of Object.values(VK_OAUTH_COOKIE)) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}

export async function GET(request: NextRequest) {
  const appUrl = appUrlFromRequest(request);
  const loginUrl = new URL("/login", appUrl);

  const fail = (code: string) => {
    loginUrl.searchParams.set("error", code);
    const res = NextResponse.redirect(loginUrl);
    clearOauthCookies(res);
    return res;
  };

  if (request.nextUrl.searchParams.get("error")) {
    return fail("vk_cancelled");
  }

  const payload = parseVkCallbackParams(request.nextUrl.searchParams);
  if (!payload) return fail("vk_invalid");

  const cookieState = request.cookies.get(VK_OAUTH_COOKIE.state)?.value;
  const verifier = request.cookies.get(VK_OAUTH_COOKIE.verifier)?.value;
  const redirectUri =
    request.cookies.get(VK_OAUTH_COOKIE.redirectUri)?.value ||
    `${appUrl}/api/auth/vk/callback`;
  const pdConsent = request.cookies.get(VK_OAUTH_COOKIE.pdConsent)?.value === "1";

  if (!cookieState || cookieState !== payload.state || !verifier) {
    return fail("vk_state");
  }

  try {
    const tokens = await exchangeVkCode({
      code: payload.code,
      codeVerifier: verifier,
      deviceId: payload.device_id,
      redirectUri,
      state: payload.state,
    });

    let info = await (async () => {
      if (tokens.access_token) {
        try {
          return await fetchVkUserInfo(tokens.access_token);
        } catch {
          /* fall through */
        }
      }
      if (!tokens.user_id) throw new Error("user_info_failed");
      return {
        user_id: tokens.user_id,
        first_name: "Игрок",
        last_name: null as string | null,
        avatar: null as string | null,
      };
    })();

    if (!info.user_id && tokens.user_id) {
      info = { ...info, user_id: tokens.user_id };
    }
    if (!info.user_id) return fail("vk_failed");

    const user = await upsertVkUser(
      {
        user_id: info.user_id,
        first_name: info.first_name,
        last_name: info.last_name ?? null,
        avatar: info.avatar ?? null,
      },
      { pdConsent }
    );
    if (!user) return fail("vk_not_linked");
    const dest = user.role === "ADMIN" ? "/admin" : "/";
    const response = NextResponse.redirect(new URL(dest, appUrl));
    await setSessionCookieOnResponse(response, user.id);
    clearOauthCookies(response);
    return response;
  } catch (e) {
    console.error("[vk/callback]", e);
    return fail("vk_failed");
  }
}
