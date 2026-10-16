import { Download, Star, Trophy, Skull } from "lucide-react";
import { Avatar } from "@/components/home/Avatar";
import { PlayerLink } from "@/components/PlayerLink";
import { DotaImg } from "@/components/match/DotaImg";
import { heroInfo } from "@/lib/replay";
import { HALL_POINTS } from "@/lib/hall-of-fame";
import type { DaySummary } from "@/lib/match-summary";
import { cn, displayName } from "@/lib/utils";
import { initials } from "@/lib/format";

type U = { id: string; firstName: string; lastName?: string | null; username?: string | null; photoUrl?: string | null };
type Viewer = { id: string; role: string };

const plural = (n: number, a: string, b: string, c: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
  return c;
};

/** Содержимое вкладки «Итоги дня» */
export function DaySummaryView({
  sessionId,
  summary,
  score,
  userMap,
  viewer,
}: {
  sessionId: string;
  summary: DaySummary;
  score: { leftName: string; rightName: string; left: number; right: number };
  userMap: Record<string, U>;
  viewer: Viewer;
}) {
  const name = (id: string) => (userMap[id] ? (id === viewer.id ? "Ты" : displayName(userMap[id])) : "Игрок");
  const mvpUser = summary.mvp ? userMap[summary.mvp.userId] : undefined;

  return (
    <div className="space-y-5 px-4 pb-5 pt-4 min-[720px]:px-6 min-[720px]:pb-6">
      {/* Счёт серии */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <p className="truncate text-right font-display text-[15px] font-semibold min-[720px]:text-[17px]">{score.leftName}</p>
        <p className="font-display text-[34px] font-bold leading-none min-[720px]:text-[44px]">
          {score.left}
          <span className="mx-2 text-[var(--text-4)]">:</span>
          {score.right}
        </p>
        <p className="truncate font-display text-[15px] font-semibold text-[var(--text-2)] min-[720px]:text-[17px]">{score.rightName}</p>
      </div>

      <div className={cn("grid grid-cols-1 gap-4 [&>*]:min-w-0", summary.mvp && summary.awards.length > 0 && "lg:grid-cols-[320px_minmax(0,1fr)]")}>
        {/* MVP дня */}
        {summary.mvp && mvpUser && (
          <section aria-label="MVP дня" className="rounded-[var(--radius-card)] border border-[var(--warning-bg)] bg-[var(--warning-bg)]/40 p-4">
            <p className="eyebrow mb-3 flex items-center gap-1.5" style={{ color: "var(--gold-ink)" }}>
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden /> MVP дня
            </p>
            <div className="flex items-center gap-3.5">
              <span className="relative block h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--control)] ring-2 ring-[var(--gold)]">
                {mvpUser.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mvpUser.photoUrl} alt={displayName(mvpUser)} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-display text-[24px] font-bold text-[var(--text-3)]">
                    {initials(mvpUser.firstName, mvpUser.lastName)}
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <PlayerLink user={mvpUser} viewer={viewer} className="block truncate font-display text-[18px] font-bold">
                  {name(mvpUser.id)}
                </PlayerLink>
                <p className="text-[12px] text-[var(--text-3)]">
                  {summary.mvp.votes} {plural(summary.mvp.votes, "голос", "голоса", "голосов")}
                  {summary.mvp.heroIds.length > 0 && ` · ${summary.mvp.heroIds.map((h) => heroInfo(h).name).join(", ")}`}
                </p>
                {summary.mvp.points > 0 && (
                  <p className="mt-0.5 text-[12px] font-semibold text-[var(--points-ink)]">+{summary.mvp.points} очк. за день</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Награды дня */}
        {summary.awards.length > 0 && (
          <section aria-label="Награды дня">
            <div className="grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2 [&>*]:min-w-0">
              {summary.awards.map((a) => {
                const u = userMap[a.userId];
                const hero = heroInfo(a.heroId);
                return (
                  <div key={a.key} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border-soft)] px-3 py-2.5">
                    <Avatar photoUrl={u?.photoUrl} firstName={u?.firstName} lastName={u?.lastName} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-3)]">{a.title}</p>
                      <p className="truncate text-[14px] font-semibold">{name(a.userId)}</p>
                      <p className="flex items-center gap-1.5 truncate text-[12px] text-[var(--text-3)]">
                        <DotaImg src={hero.img} alt={hero.name} className="h-[14px] w-[24px] shrink-0 rounded-[2px] object-cover" />
                        {hero.name} · игра {a.gameNumber}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono-num text-[16px] font-bold">{a.display}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {(summary.hall.length > 0 || summary.predictions || summary.topPoints.length > 0) && (
        <div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-3 [&>*]:min-w-0">
          {summary.hall.map((r) => (
            <div
              key={r.code}
              className={cn(
                "rounded-[var(--radius-control)] border px-3.5 py-3",
                r.anti ? "border-[var(--danger-bg)] bg-[var(--danger-bg)]/50" : "border-[var(--gold-light)] bg-[var(--warning-bg)]/40"
              )}
            >
              <p
                className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em]", r.anti ? "text-[var(--danger)]" : "text-[var(--gold-ink)]")}
              >
                {r.anti ? <Skull className="h-3.5 w-3.5" aria-hidden /> : <Trophy className="h-3.5 w-3.5" aria-hidden />}
                {r.anti ? "Антирекорд" : "Зал славы"} · {r.anti ? "−" : "+"}
                {HALL_POINTS}
              </p>
              <p className="mt-1 text-[13px] font-semibold">
                {r.title} — {r.display}
              </p>
              <p className="truncate text-[12px] text-[var(--text-3)]">
                {name(r.userId)} · {heroInfo(r.heroId).name}
              </p>
            </div>
          ))}

          {summary.predictions && (
            <div className="rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]">Прогнозы</p>
              <p className="mt-1 text-[13px] font-semibold">
                {summary.predictions.correctUserIds.length
                  ? `Все игры угадали ${summary.predictions.correctUserIds.length} из ${summary.predictions.total}`
                  : `Никто не угадал все игры (${summary.predictions.total} прогнозов)`}
              </p>
              {summary.predictions.correctUserIds.length > 0 && (
                <p className="truncate text-[12px] text-[var(--text-3)]">
                  {summary.predictions.correctUserIds.map((id) => userMap[id]?.firstName ?? "Игрок").join(", ")}
                </p>
              )}
            </div>
          )}

          {summary.topPoints.length > 0 && (
            <div className="rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]">Больше всех очков за матч</p>
              <ol className="mt-1 space-y-0.5">
                {summary.topPoints.map((t, i) => (
                  <li key={t.userId} className="flex items-center gap-2 text-[13px]">
                    <span className="w-3 font-mono-num text-[11px] text-[var(--text-3)]">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{name(t.userId)}</span>
                    <span className="font-mono-num font-bold text-[var(--points-ink)]">+{t.points}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-3">
        <p className="text-[12px] text-[var(--text-3)]">
          {viewer.role === "ADMIN"
            ? "Табло, драфт и статистика каждой игры — во вкладке «Игры»."
            : "Когда определится MVP, бот пришлёт картинку итогов в Telegram. Табло и статистика — во вкладке «Игры»."}
        </p>
        {viewer.role === "ADMIN" && (
          <a
            href={`/api/matches/${sessionId}/summary-image?download=1`}
            download
            className="press inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--points-bg)] px-3.5 text-[13px] font-semibold text-[var(--points-ink)] transition-colors hover:bg-[var(--points-border)]"
          >
            <Download className="h-4 w-4" aria-hidden />
            Скачать картинку для Telegram
          </a>
        )}
      </div>
    </div>
  );
}
