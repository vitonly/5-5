"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ConsentClient() {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!checked) {
      setError("Нужно согласие на обработку персональных данных");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/pd-consent", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось сохранить");
        return;
      }
      window.location.href = data.redirect || "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-[440px]">
      <CardHeader>
        <CardTitle className="font-display text-2xl">Согласие на обработку ПД</CardTitle>
        <CardDescription>
          Чтобы продолжить пользоваться СТАРТ+, подтвердите согласие на обработку персональных
          данных в соответствии с 152-ФЗ.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-2)]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--points)]"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            Я согласен(на) на обработку персональных данных согласно{" "}
            <Link href="/privacy" className="text-[var(--points)] underline" target="_blank">
              Политике конфиденциальности
            </Link>
            .
          </span>
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <Button onClick={() => void submit()} disabled={loading || !checked} className="w-full">
          {loading ? "Сохранение…" : "Продолжить"}
        </Button>
      </CardContent>
    </Card>
  );
}
