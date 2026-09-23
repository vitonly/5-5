"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const botUsername = (process.env.NEXT_PUBLIC_BOT_USERNAME || "").replace(/^@/, "");
  const isDev = process.env.NODE_ENV !== "production";

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [botWaiting, setBotWaiting] = useState(false);
  const [botToken, setBotToken] = useState<string | null>(null);

  useEffect(() => {
    const err = searchParams.get("error");
    if (!err) return;
    const map: Record<string, string> = {
      bot_not_configured: "Telegram-бот не настроен на сервере.",
      telegram_cancelled: "Вход через Telegram отменён.",
      telegram_invalid: "Неверная подпись Telegram. Проверьте токен бота.",
      telegram_failed: "Не удалось войти через Telegram.",
    };
    setError(map[err] || "Ошибка входа через Telegram.");
  }, [searchParams]);

  useEffect(() => {
    if (!botWaiting || !botToken) return;

    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/auth/telegram/ticket?token=${encodeURIComponent(botToken)}`,
          { credentials: "same-origin", cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;

        if (data.status === "READY") {
          clearInterval(id);
          const done = await fetch("/api/auth/telegram/ticket", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ action: "complete", token: botToken }),
          });
          const doneData = await done.json().catch(() => ({}));
          if (!done.ok) {
            setBotWaiting(false);
            setBotToken(null);
            setError(
              typeof doneData.error === "string"
                ? doneData.error
                : `Не удалось создать сессию (${done.status}). Попробуйте ещё раз.`
            );
            return;
          }
          window.location.href = doneData.role === "ADMIN" ? "/admin" : "/";
        } else if (data.status === "EXPIRED" || data.status === "INVALID") {
          clearInterval(id);
          setBotWaiting(false);
          setBotToken(null);
          setError("Ссылка входа истекла. Нажмите «Войти через Telegram» ещё раз.");
        } else if (data.status === "USED") {
          clearInterval(id);
          setBotWaiting(false);
          setBotToken(null);
          setError("Этот вход уже использован. Нажмите «Войти через Telegram» ещё раз.");
        }
      } catch {
        /* ignore transient poll errors */
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [botWaiting, botToken]);

  const handlePasswordLogin = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Неверный логин или пароль");
    }
  }, [login, password, router]);

  const handleBotLogin = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/telegram/ticket", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось начать вход через Telegram");
        return;
      }
      setBotToken(data.token);
      setBotWaiting(true);
      window.open(data.botUrl, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDevLogin = useCallback(async () => {
    const res = await fetch("/api/auth/dev-login", { method: "POST" });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError("Не удалось войти в режиме разработки.");
    }
  }, [router]);

  return (
    <Card className="w-full max-w-[420px]">
      <CardHeader className="text-center">
        <CardTitle className="font-display text-3xl text-[var(--points)]">Dota 5x5</CardTitle>
        <CardDescription>Платформа обучения Dota. Войдите, чтобы продолжить.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={handleBotLogin}
          disabled={loading || botWaiting || !botUsername}
          className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-[8px] bg-[#54A9EB] px-4 text-[15px] font-medium text-white transition-colors hover:bg-[#4B9AD6] disabled:pointer-events-none disabled:opacity-50 min-[720px]:h-11"
        >
          <TelegramIcon />
          {botWaiting ? "Ждём подтверждение…" : "Войти через Telegram"}
        </button>

        {botWaiting && (
          <p className="text-center text-[13px] text-[var(--text-2)]">
            В Telegram нажмите <b>Start</b> / <b>Запустить</b>. Эта страница обновится сама.
          </p>
        )}

        <div className="flex items-center gap-3 text-[13px] text-[var(--text-4)]">
          <div className="h-px flex-1 bg-[var(--border)]" />
          ИЛИ
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="login">Логин</Label>
            <Input
              id="login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Ваш логин"
            />
          </div>
          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
              placeholder="Ваш пароль"
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <Button
            onClick={handlePasswordLogin}
            disabled={loading || !login || !password}
            className="w-full"
          >
            {loading ? "Вход..." : "Войти"}
          </Button>
        </div>

        <p className="text-center text-[13px] text-[var(--text-3)]">
          Логин и пароль выдаёт тренер, если нет Telegram.
        </p>

        {isDev && (
          <div className="border-t border-[var(--border-soft)] pt-4">
            <Button type="button" variant="admin" onClick={handleDevLogin} className="w-full">
              Войти как админ (только разработка)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <Suspense fallback={<p className="text-[var(--text-2)]">Загрузка…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
