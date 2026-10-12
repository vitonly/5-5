import Link from "next/link";
import { MATCH_STATUS_LABELS } from "@/lib/labels";
import { formatRelative, formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = keyof typeof MATCH_STATUS_LABELS;

export function NextMatchCard({
  match,
}: {
  match: {
    date: Date;
    status: Status;
    players: number;
    capacity: number;
    myState: "lineup" | "joined" | "queued" | "invited" | "declined" | null;
  } | null;
}) {
  if (!match) {
    return (
      <div className="surface-card p-4">
        <p className="eyebrow">Ближайший 5v5</p>
        <p className="mt-2 text-sm text-[var(--text-2)]">Матч пока не назначен — тренер пришлёт приглашение в Telegram.</p>
      </div>
    );
  }

  const live = match.status === "IN_PROGRESS";
  const myLabel =
    match.myState === "lineup"
      ? "Ты в составе"
      : match.myState === "joined"
        ? "Ты записан"
        : match.myState === "queued"
          ? "Ты в очереди"
          : match.myState === "invited"
            ? "Ответь в Telegram-боте"
            : match.myState === "declined"
              ? "Ты отказался"
              : null;
  const pct = Math.min(100, Math.round((match.players / match.capacity) * 100));

  return (
    <Link
      href="/match"
      className="hover-lift block overflow-hidden rounded-[var(--radius-card)] bg-[var(--points)] p-4 text-[var(--on-points)] shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
          {live ? "5v5 идёт сейчас" : "Ближайший 5v5"}
        </p>
        {live ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
            LIVE
          </span>
        ) : (
          <span className="text-[12px] font-medium text-white/80">{formatRelative(match.date)}</span>
        )}
      </div>
      <p className="mt-1.5 font-display text-[18px] font-bold leading-tight">
        {formatShortDateTime(match.date)}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
          <span className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </span>
        <span className="shrink-0 font-mono-num text-[13px] font-bold">
          {match.players}/{match.capacity}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
        <span className="text-white/85">{MATCH_STATUS_LABELS[match.status]}</span>
        {myLabel && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
              match.myState === "invited" ? "bg-white text-[var(--points-ink)]" : "bg-white/15"
            )}
          >
            {myLabel}
          </span>
        )}
      </div>
    </Link>
  );
}
