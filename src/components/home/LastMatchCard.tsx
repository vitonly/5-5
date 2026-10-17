import Link from "next/link";
import { Star } from "lucide-react";
import { Avatar } from "@/components/home/Avatar";
import { formatShortDate } from "@/lib/format";
import { cn, displayName } from "@/lib/utils";

type Person = { id: string; firstName: string; lastName?: string | null; username?: string | null; photoUrl?: string | null };

/** «Итоги последнего 5v5»: счёт, команды и MVP дня. Ведёт на страницу 5×5. */
export function LastMatchCard({
  date,
  radiantName,
  direName,
  radiantWins,
  direWins,
  mvp,
  mvpTeamWon,
  sessionId,
  correctPredictors,
}: {
  date: Date;
  radiantName: string;
  direName: string;
  radiantWins: number;
  direWins: number;
  /** null — MVP ещё не определён, показываем ★ */
  mvp: Person | null;
  mvpTeamWon: boolean | null;
  /** Для ссылки сразу на «Итоги дня» этого матча */
  sessionId?: string;
  /** Кто угадал все игры дня */
  correctPredictors?: Person[];
}) {
  return (
    <Link
      href={sessionId ? `/match?open=${sessionId}#m-${sessionId}` : "/match"}
      className="hover-lift mx-auto block max-w-[720px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-4 min-[720px]:px-5">
        <p className="eyebrow">Итоги 5v5 · {formatShortDate(date)}</p>
        <span className="text-[13px] font-medium text-[var(--points)]">Итоги дня →</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 min-[720px]:px-5">
        <p className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--success)]" aria-hidden />
          <span className={cn("truncate text-[14px] font-semibold", radiantWins > direWins ? "text-[var(--text)]" : "text-[var(--text-2)]")}>
            {radiantName}
          </span>
        </p>
        <p className="font-display text-[24px] font-bold leading-none tracking-tight min-[720px]:text-[28px]">
          {radiantWins}
          <span className="mx-1 text-[var(--text-3)]">:</span>
          {direWins}
        </p>
        <p className="flex min-w-0 flex-row-reverse items-center gap-2 text-right">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--danger)]" aria-hidden />
          <span className={cn("truncate text-[14px] font-semibold", direWins > radiantWins ? "text-[var(--text)]" : "text-[var(--text-2)]")}>
            {direName}
          </span>
        </p>
      </div>

      <div className="mx-4 mb-4 flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-2.5 min-[720px]:mx-5">
        {mvp ? (
          <>
            <span className="relative shrink-0 rounded-full ring-2 ring-[var(--gold-light)]">
              <Avatar photoUrl={mvp.photoUrl} firstName={mvp.firstName} lastName={mvp.lastName} size={44} className="ring-0" />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gold)] ring-2 ring-[var(--warning-bg)]">
                <Star className="h-3 w-3 fill-white text-white" aria-hidden />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--warning-ink)]">MVP дня</span>
              <span className="block truncate font-display text-[16px] font-bold leading-tight text-[var(--text)]">
                {displayName(mvp)}
              </span>
              {mvpTeamWon && <span className="block text-[12px] text-[var(--text-2)]">Команда победила</span>}
            </span>
          </>
        ) : (
          <>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gold)]/20 ring-2 ring-[var(--gold-light)]">
              <Star className="h-6 w-6 fill-[var(--gold)] text-[var(--gold)]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--warning-ink)]">MVP дня</span>
              <span className="block font-display text-[16px] font-bold leading-tight text-[var(--text-2)]">
                Скоро определится
              </span>
            </span>
          </>
        )}
      </div>

      {correctPredictors && correctPredictors.length > 0 && (
        <div className="mx-4 mb-4 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 min-[720px]:mx-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">Угадали все игры</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--success-ink)]">
            {correctPredictors.map((p) => displayName(p)).join(", ")}
          </p>
        </div>
      )}
    </Link>
  );
}
