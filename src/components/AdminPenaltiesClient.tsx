"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { displayName, formatDate } from "@/lib/utils";
import { formatPoints } from "@/lib/points";
import { PlayerLink } from "@/components/PlayerLink";
import type { Penalty, User } from "@prisma/client";

type PenaltyWithUsers = Penalty & { target: User; admin: User };
type Student = User;

export function AdminPenaltiesClient({
  penalties: initial,
  students,
}: {
  penalties: PenaltyWithUsers[];
  students: Student[];
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(students[0]?.id || "");
  const [amount, setAmount] = useState(0.5);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"penalty" | "bonus">("penalty");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await fetch("/api/penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, amount, reason, type: mode }),
      });
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Корректировка очков</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "penalty" ? "destructive" : "outline"}
              onClick={() => setMode("penalty")}
            >
              Штраф (−)
            </Button>
            <Button
              type="button"
              variant={mode === "bonus" ? "default" : "outline"}
              onClick={() => setMode("bonus")}
            >
              Бонус (+)
            </Button>
          </div>
          <div>
            <Label>Игрок</Label>
            <select
              className="flex h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {displayName(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Сумма</Label>
            <Input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Причина</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={!targetId || !reason || busy}>
            {mode === "bonus" ? "Начислить бонус" : "Выдать штраф"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История</CardTitle>
        </CardHeader>
        <CardContent>
          {initial.length === 0 ? (
            <p className="text-[var(--text-3)]">Записей пока нет</p>
          ) : (
            <ul className="divide-y divide-[var(--border-soft)] text-sm">
              {initial.map((p) => (
                <li key={p.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={`mt-0.5 inline-flex h-7 min-w-[52px] shrink-0 items-center justify-center rounded-full px-2 font-mono-num text-[13px] font-bold ${
                      p.amount >= 0
                        ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
                        : "bg-[var(--danger-bg)] text-[var(--danger)]"
                    }`}
                  >
                    {p.amount >= 0 ? "+" : "−"}
                    {formatPoints(Math.abs(p.amount))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      <PlayerLink user={p.target} className="inline font-medium" />
                      <span className="text-[var(--text-2)]"> · {p.reason}</span>
                    </span>
                    <span className="block text-xs text-[var(--text-3)]">
                      {formatDate(p.createdAt)} · {p.admin?.firstName}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
