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

type Standing = {
  place: number;
  id: string;
  name: string;
  votes: number;
};

type Status = {
  open: boolean;
  resolved: boolean;
  votesCount: number;
  playersCount: number;
  hasVoted: boolean;
  winnerId: string | null;
  winnerName: string | null;
  votedNames: string[];
  pendingNames: string[];
  standings: Standing[];
};

const MEDALS = ["🥇", "🥈", "🥉"];

export function MatchMvpClient({
  sessionId,
  nominees,
}: {
  sessionId: string;
  nominees: Nominee[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
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

  const standings =
    status.standings?.length > 0 ? (
      <div className="mt-2 space-y-0.5 text-xs text-[var(--text-2)]">
        <p className="font-medium text-[var(--text)]">Топ-3 по голосам</p>
        {status.standings.map((s) => (
          <p key={s.id}>
            {MEDALS[s.place - 1] ?? `${s.place}.`} {s.name} — <b>{s.votes}</b>
          </p>
        ))}
      </div>
    ) : (
      <p className="mt-2 text-xs text-[var(--text-4)]">Топ-3: пока нет голосов</p>
    );

  const turnout = (
    <div className="mt-2 space-y-1 text-xs text-[var(--text-3)]">
      <p>
        Голосов: {status.votesCount}/{status.playersCount} (кто именно за кого — скрыто)
      </p>
      {standings}
      {status.votedNames.length > 0 && (
        <p>
          <span className="text-[var(--success)]">Проголосовали:</span>{" "}
          {status.votedNames.join(", ")}
        </p>
      )}
      {status.pendingNames.length > 0 && !status.resolved && (
        <p>
          <span className="text-[var(--text-4)]">Ещё нет голоса:</span>{" "}
          {status.pendingNames.join(", ")}
        </p>
      )}
    </div>
  );

  if (status.resolved) {
    return (
      <div className="text-sm text-[var(--text-3)]">
        <p>
          MVP дня: голосование закрыто
          {status.winnerName
            ? ` — победитель ${status.winnerName}`
            : " (ничья — очки не начислены)"}
          .
        </p>
        {turnout}
      </div>
    );
  }

  if (status.hasVoted) {
    return (
      <div className="text-sm text-[var(--success)]">
        <p>Ваш голос за MVP учтён. Выбор анонимен для остальных.</p>
        {turnout}
      </div>
    );
  }

  if (!status.open) return null;

  return (
    <div className="space-y-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3">
      <p className="text-sm font-semibold">🏆 MVP игрового дня</p>
      <p className="text-xs text-[var(--text-3)]">
        Один голос до 23:59 МСК. За себя нельзя. Голосование анонимное.
      </p>
      {turnout}
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
