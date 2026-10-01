"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TG_LOGIN_TOKEN_KEY = "tg_login_token";
const TG_LOGIN_URL_KEY = "tg_login_url";

/** https://t.me/Bot?start=x → tg://resolve?domain=Bot&start=x (надёжнее на телефоне) */
function toTelegramDeepLink(httpsUrl: string): string {
  try {
    const u = new URL(httpsUrl);
    if (u.hostname !== "t.me" && u.hostname !== "telegram.me") return httpsUrl;
    const domain = u.pathname.replace(/^\//, "").split("/")[0];
    if (!domain) return httpsUrl;
    const start = u.searchParams.get("start");
    const q = start ? `?domain=${encodeURIComponent(domain)}&start=${encodeURIComponent(start)}` : `?domain=${encodeURIComponent(domain)}`;
    return `tg://resolve${q}`;
  } catch {
    return httpsUrl;
  }
}

/**
 * Промежуточная страница на нашем домене.
 * 1) Сохраняет тикет входа
 * 2) Редиректит в t.me / Telegram
 * 3) Когда iOS «◀ Telegram» вернёт в Safari — снова наша страница, уводим на /login
 */
function OpenTelegram() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leftForTelegram = useRef(false);
  const token = searchParams.get("token");
  const to = searchParams.get("to");

  useEffect(() => {
    if (!token || !to) {
      router.replace("/login");
      return;
    }

    try {
      sessionStorage.setItem(TG_LOGIN_TOKEN_KEY, token);
      sessionStorage.setItem(TG_LOGIN_URL_KEY, to);
    } catch {
      /* ignore */
    }

    function returnToLogin() {
      // Только после того, как реально уходили в Telegram — иначе pageshow
      // на первой загрузке срывает редирект и «Открыть вручную».
      if (!leftForTelegram.current) return;
      router.replace("/login");
    }

    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) returnToLogin();
    }
    function onVisible() {
      if (document.visibilityState === "visible") returnToLogin();
    }

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);

    const t = window.setTimeout(() => {
      leftForTelegram.current = true;
      // Сначала deep link приложения, иначе https://t.me
      window.location.href = toTelegramDeepLink(to);
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.href = to;
        }
      }, 400);
    }, 80);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, token, to]);

  function openManual(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (!to) return;
    leftForTelegram.current = true;
    window.location.assign(toTelegramDeepLink(to));
    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.assign(to);
      }
    }, 400);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] p-6 text-center">
      <p className="text-lg font-medium text-[var(--text)]">Открываем Telegram…</p>
      <p className="max-w-sm text-sm text-[var(--text-3)]">
        Нажмите Start в боте, затем вернитесь сюда — вход завершится сам.
      </p>
      <a
        href={to || "/login"}
        onClick={openManual}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[#54A9EB] px-5 text-sm font-medium text-white"
      >
        Открыть Telegram вручную
      </a>
      <button
        type="button"
        onClick={() => {
          leftForTelegram.current = false;
          router.replace("/login");
        }}
        className="text-sm text-[var(--points)] underline"
      >
        Уже нажал Start — вернуться на вход
      </button>
    </main>
  );
}

export default function OpenTelegramPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
          <p className="text-[var(--text-2)]">Загрузка…</p>
        </main>
      }
    >
      <OpenTelegram />
    </Suspense>
  );
}
