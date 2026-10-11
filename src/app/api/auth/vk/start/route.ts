import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  buildVkRedirectUri,
  createCodeChallenge,
  createCodeVerifier,
  createOAuthState,
  getVkClientId,
  isVkConfigured,
  VK_OAUTH_COOKIE,
} from "@/lib/vk-auth";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 10,
};

function appUrlFromRequest(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (host ? `${proto}://${host}` : request.nextUrl.origin)
  ).replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const appUrl = appUrlFromRequest(request);
  const loginUrl = new URL("/login", appUrl);

  const pd = request.nextUrl.searchParams.get("pd");
  if (pd !== "1") {
    loginUrl.searchParams.set("error", "pd_required");
    return NextResponse.redirect(loginUrl);
  }

  if (!isVkConfigured()) {
    loginUrl.searchParams.set("error", "vk_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const clientId = getVkClientId();
  const redirectUri = buildVkRedirectUri(appUrl);
  const state = createOAuthState();
  const verifier = createCodeVerifier();
  const challenge = createCodeChallenge(verifier);

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(VK_OAUTH_COOKIE.state, state, COOKIE_OPTS);
  response.cookies.set(VK_OAUTH_COOKIE.verifier, verifier, COOKIE_OPTS);
  response.cookies.set(VK_OAUTH_COOKIE.pdConsent, "1", COOKIE_OPTS);
  response.cookies.set(VK_OAUTH_COOKIE.redirectUri, redirectUri, COOKIE_OPTS);
  return response;
}
