import { AchievementBadge, TIER_NAMES, TierDots } from "@/components/achievements/AchievementBadge";
import { CATEGORY_LABELS, type AchievementCategory, type AchievementView } from "@/lib/achievements";
import { formatShortDate } from "@/lib/format";
import { formatPoints } from "@/lib/points";
import { cn } from "@/lib/utils";

const ORDER: AchievementCategory[] = ["matches", "mvp", "homework", "lessons", "rating", "team"];

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
          Бронза — значок, серебро +0.5 очка, золото +1. {isOwn ? "Есть и секретные — попробуй найти." : ""}
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
                const hidden = a.secret && locked;
                const progress = a.nextNeed ? Math.min(1, a.value / a.nextNeed) : 1;
                return (
                  <div
                    key={a.code}
                    className={cn("surface-card flex items-center gap-3 px-3.5 py-3", locked && "bg-[var(--surface-muted)]")}
                  >
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
                          {hidden ? "Секретная ачивка" : a.title}
                        </p>
                        <TierDots tier={a.tier} maxTier={a.maxTier} />
                      </div>
                      <p className="truncate text-[12px] text-[var(--text-3)]">
                        {hidden ? "Условие скрыто" : a.description}
                      </p>
                      {!hidden && a.nextNeed != null && a.nextNeed > 1 ? (
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
