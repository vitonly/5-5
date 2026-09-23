"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { TelegramLogin } from "@/components/TelegramLogin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const botUsername = (process.env.NEXT_PUBLIC_BOT_USERNAME || "").replace(/^@/, "");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const isDev = process.env.NODE_ENV !== "production";

  const authUrl = useMemo(() => {
    const base = appUrl || (typeof window !== "undefined" ? window.location.origin : "");
    return base ? `${base}/api/auth/telegram/callback` : "";
  }, [appUrl]);

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
            setError(doneData.error || "Не удалось создать сессию. Попробуйте ещё раз.");
            return;
          }
          // Жёсткий переход — cookie уже в ответе
          window.location.href = doneData.role === "ADMIN" ? "/admin" : "/";
        } else if (data.status === "EXPIRED" || data.status === "INVALID") {
          clearInterval(id);
          setBotWaiting(false);
          setBotToken(null);
          setError("Ссылка входа истекла. Нажмите «Войти через бота» ещё раз.");
        } else if (data.status === "USED") {
          clearInterval(id);
          setBotWaiting(false);
          setBotToken(null);
          setError("Этот вход уже использован. Нажмите «Войти через бота» ещё раз.");
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
        setError(data.error || "Не удалось начать вход через бота");
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
        {authUrl && botUsername ? (
          <div className="flex justify-center">
            <TelegramLogin botUsername={botUsername} authUrl={authUrl} />
          </div>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleBotLogin}
          disabled={loading || botWaiting || !botUsername}
        >
          {botWaiting ? "Ждём подтверждение в Telegram…" : "Войти через бота"}
        </Button>

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
          Рекомендуем «Войти через бота» — без окна подтверждения на сайте.
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
