import { AchievementBadge, TIER_NAMES, TierDots } from "@/components/achievements/AchievementBadge";
import { CATEGORY_LABELS, type AchievementCategory, type AchievementView } from "@/lib/achievements";
import { formatShortDate } from "@/lib/format";
import { formatPoints } from "@/lib/points";
import { cn } from "@/lib/utils";

const TIER_COLOR: Record<number, string> = { 1: "var(--bronze)", 2: "var(--silver)", 3: "var(--gold)" };

/** Подсказка при наведении / фокусе (тап на телефоне): прогресс по каждому уровню */
function ProgressTip({
  id,
  a,
  hideCondition,
  locked,
}: {
  id: string;
  a: AchievementView;
  hideCondition: boolean;
  locked: boolean;
}) {
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none invisible absolute left-2 right-2 top-full z-30 mt-1.5 translate-y-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 opacity-0 shadow-[var(--shadow-popover)] transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus:visible group-focus:translate-y-0 group-focus:opacity-100"
    >
      {hideCondition ? (
        <p className="text-[12px] text-[var(--text-3)]">
          {locked
            ? "Секретная ачивка — условие откроется, когда получишь её."
            : "Секретное условие видит только тот, кто получил эту ачивку."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {a.tiers.map((t) => {
            const single = t.need <= 1 || a.code === "podium";
            const shown = Math.min(a.value, t.need);
            return (
              <li key={t.tier} className="flex items-center gap-2 text-[12px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TIER_COLOR[t.tier] }} aria-hidden />
                <span className={cn("min-w-0 flex-1", t.done ? "text-[var(--text)]" : "text-[var(--text-2)]")}>
                  {a.secret ? a.description : `${TIER_NAMES[t.tier]}: ${t.description}`}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono-num font-semibold",
                    t.done ? "text-[var(--success-ink)]" : "text-[var(--text-3)]"
                  )}
                >
                  {t.done ? "✓" : single ? "—" : `${shown} из ${t.need}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const ORDER: AchievementCategory[] = ["matches", "mvp", "homework", "lessons"];

export function AchievementsTab({
  items,
  unlockedCount,
  totalCount,
  points,
  isOwn,
}: {
  items: AchievementView[];
  unlockedCount: number;
  totalCount: number;
  points: number;
  isOwn: boolean;
}) {
  const pct = totalCount ? Math.round((unlockedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 min-[720px]:px-5">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Коллекция</p>
          <p className="mt-1 font-display text-[22px] font-bold leading-tight">
            {unlockedCount}
            <span className="text-[var(--text-3)]"> / {totalCount}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--control)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--bronze), var(--gold))" }}
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-[var(--text-3)]">Бонус за ачивки</p>
          <p className="font-mono-num text-[20px] font-bold text-[var(--points-ink)]">+{formatPoints(points)}</p>
        </div>
        <p className="w-full text-[12px] text-[var(--text-3)]">
          Бронза — значок, серебро +0.5 очка, золото +1, секретные +0.5. Наведи на ачивку, чтобы увидеть прогресс.
          {isOwn ? " Секретные — попробуй найти; условие видишь только ты." : " У чужих секретных ачивок условие скрыто."}
        </p>
      </div>

      {ORDER.map((cat) => {
        const list = items.filter((i) => i.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat}>
            <h3 className="mb-3 text-[15px] font-semibold text-[var(--text)]">{CATEGORY_LABELS[cat]}</h3>
            <div className="grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => {
                const locked = a.tier === 0;
                const secretLocked = a.secret && locked;
                const hideCondition = a.secret && (locked || !isOwn);
                const progress = a.nextNeed ? Math.min(1, a.value / a.nextNeed) : 1;
                return (
                  <div
                    key={a.code}
                    tabIndex={0}
                    aria-describedby={`ach-tip-${a.code}`}
                    className={cn(
                      "surface-card group relative flex items-center gap-3 px-3.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--points)]",
                      locked && "bg-[var(--surface-muted)]"
                    )}
                  >
                    <ProgressTip
                      id={`ach-tip-${a.code}`}
                      a={a}
                      hideCondition={hideCondition}
                      locked={locked}
                    />
                    <AchievementBadge
                      icon={a.icon}
                      tier={a.tier || 1}
                      locked={locked}
                      secret={a.secret}
                      size={48}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn("truncate text-[14px] font-semibold", locked ? "text-[var(--text-2)]" : "text-[var(--text)]")}>
                          {secretLocked ? "Секретная ачивка" : a.title}
                        </p>
                        {!a.secret && <TierDots tier={a.tier} maxTier={a.maxTier} />}
                      </div>
                      <p className="truncate text-[12px] text-[var(--text-3)]">
                        {hideCondition
                          ? secretLocked
                            ? "Условие скрыто"
                            : "Секретное условие"
                          : a.description}
                      </p>
                      {!hideCondition && a.nextNeed != null && a.nextNeed > 1 ? (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--control)]">
                            <div className="h-full rounded-full bg-[var(--points)]" style={{ width: `${progress * 100}%` }} />
                          </div>
                          <span className="font-mono-num text-[11px] text-[var(--text-3)]">
                            {Math.min(a.value, a.nextNeed)}/{a.nextNeed}
                          </span>
                        </div>
                      ) : !locked && a.unlockedAt ? (
                        <p className="mt-0.5 text-[11px] font-medium" style={{ color: a.tier === 3 ? "var(--gold-ink)" : a.tier === 2 ? "var(--silver-ink)" : "var(--bronze-ink)" }}>
                          {TIER_NAMES[a.tier]} · {formatShortDate(a.unlockedAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
