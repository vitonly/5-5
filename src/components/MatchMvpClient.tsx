"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { displayName } from "@/lib/utils";

type Nominee = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
};

export function MatchMvpClient({
  sessionId,
  nominees,
}: {
  sessionId: string;
  nominees: Nominee[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<{
    open: boolean;
    resolved: boolean;
    votesCount: number;
    playersCount: number;
    myNomineeId: string | null;
    winnerId: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/matches/mvp?sessionId=${sessionId}`);
      const data = await res.json().catch(() => ({}));
      if (!cancelled && data.status) setStatus(data.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function vote(nomineeId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/matches/mvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, nomineeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Ошибка");
        return;
      }
      router.refresh();
      const st = await fetch(`/api/matches/mvp?sessionId=${sessionId}`);
      const stData = await st.json().catch(() => ({}));
      if (stData.status) setStatus(stData.status);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  if (status.resolved) {
    return (
      <p className="text-sm text-[var(--text-3)]">
        MVP дня: голосование закрыто
        {status.winnerId ? " (победитель определён)" : " (ничья — очки не начислены)"}. Голосов:{" "}
        {status.votesCount}/{status.playersCount}
      </p>
    );
  }

  if (status.myNomineeId) {
    return (
      <p className="text-sm text-[var(--success)]">
        Вы уже проголосовали за MVP. Голосов: {status.votesCount}/{status.playersCount}
      </p>
    );
  }

  if (!status.open) return null;

  return (
    <div className="space-y-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3">
      <p className="text-sm font-semibold">🏆 MVP игрового дня</p>
      <p className="text-xs text-[var(--text-3)]">
        Один голос до 23:59 МСК. За себя голосовать нельзя. Сейчас: {status.votesCount}/
        {status.playersCount}
      </p>
      <div className="flex flex-wrap gap-2">
        {nominees.map((n) => (
          <Button
            key={n.id}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => vote(n.id)}
          >
            {displayName(n)}
          </Button>
        ))}
      </div>
    </div>
  );
}
