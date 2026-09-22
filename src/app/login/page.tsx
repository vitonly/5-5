"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { TelegramLogin } from "@/components/TelegramLogin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || "dev_bot";
  const isDev = process.env.NODE_ENV !== "production";

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = useCallback(
    async (user: Record<string, string | number>) => {
      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Ошибка входа через Telegram.");
      }
    },
    [router]
  );

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
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <Card className="w-full max-w-[420px]">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-3xl text-[var(--points)]">Dota 5x5</CardTitle>
          <CardDescription>Платформа обучения Dota. Войдите, чтобы продолжить.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex justify-center">
            <TelegramLogin botUsername={botUsername} onAuth={handleAuth} />
          </div>

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
    </main>
  );
}
