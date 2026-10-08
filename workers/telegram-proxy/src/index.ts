/**
 * Cloudflare Worker: мост Timeweb VPS ↔ Telegram Bot API.
 *
 * 1) Исходящие с VPS:  POST /bot<token>/<method>  (+ header X-Telegram-Proxy-Secret)
 *    → https://api.telegram.org/bot<token>/<method>
 *
 * 2) Входящий webhook: POST /webhook
 *    Telegram → Worker → https://www.startdota.ru/api/telegram/webhook
 */

export interface Env {
  PROXY_SECRET: string;
  FORWARD_WEBHOOK_URL: string;
}

const TG_API = "https://api.telegram.org";

function unauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

async function proxyToTelegram(request: Request, pathWithQuery: string): Promise<Response> {
  const url = `${TG_API}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`;
  const init: RequestInit = {
    method: request.method,
    headers: new Headers(),
    redirect: "follow",
  };

  const ct = request.headers.get("Content-Type");
  if (ct) (init.headers as Headers).set("Content-Type", ct);

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(url, init);
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
}

async function forwardWebhook(request: Request, env: Env): Promise<Response> {
  const target = (env.FORWARD_WEBHOOK_URL || "").trim();
  if (!target) {
    return new Response(JSON.stringify({ ok: false, error: "FORWARD_WEBHOOK_URL not set" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret) headers.set("X-Telegram-Bot-Api-Secret-Token", secret);

  const body = await request.arrayBuffer();
  const res = await fetch(target, { method: "POST", headers, body });
  // Telegram wants quick 200; если origin упал — всё равно 200, чтобы не ретраил вечно
  if (!res.ok) {
    console.error("forward webhook failed", res.status, await res.text().catch(() => ""));
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health
    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return new Response(JSON.stringify({ ok: true, service: "startplus-tg-proxy" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Telegram → Worker → VPS
    if (path === "/webhook" || path === "/webhook/") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      return forwardWebhook(request, env);
    }

    // VPS → Worker → api.telegram.org  (path like /botTOKEN/sendMessage)
    if (path.startsWith("/bot")) {
      const secret = request.headers.get("X-Telegram-Proxy-Secret") || "";
      if (!env.PROXY_SECRET || secret !== env.PROXY_SECRET) {
        return unauthorized();
      }
      return proxyToTelegram(request, path + url.search);
    }

    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};
