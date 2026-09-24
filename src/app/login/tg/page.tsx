"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TG_LOGIN_TOKEN_KEY = "tg_login_token";
const TG_LOGIN_URL_KEY = "tg_login_url";

/**
 * Промежуточная страница на нашем домене.
 * 1) Сохраняет тикет входа
 * 2) Редиректит в t.me / Telegram
 * 3) Когда iOS «◀ Telegram» вернёт в Safari — снова наша страница, уводим на /login
 */
function OpenTelegram() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirected = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");
    const to = searchParams.get("to");

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

    function goLogin() {
      router.replace("/login");
    }

    // Вернулись из приложения Telegram на эту же вкладку
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted || document.visibilityState === "visible") {
        goLogin();
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible" && redirected.current) {
        goLogin();
      }
    }

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);

    if (!redirected.current) {
      redirected.current = true;
      // Небольшая пауза, чтобы успел записаться sessionStorage
      const t = window.setTimeout(() => {
        window.location.href = to;
      }, 50);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("pageshow", onPageShow);
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] p-6 text-center">
      <p className="text-lg font-medium text-[var(--text)]">Открываем Telegram…</p>
      <p className="max-w-sm text-sm text-[var(--text-3)]">
        Нажмите Start в боте, затем вернитесь сюда — вход завершится сам.
      </p>
      <a
        href={searchParams.get("to") || "/login"}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[#54A9EB] px-5 text-sm font-medium text-white"
      >
        Открыть Telegram вручную
      </a>
      <button
        type="button"
        onClick={() => router.replace("/login")}
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
