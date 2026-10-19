import Link from "next/link";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FolderArchive,
  Gamepad2,
  MessageCircleOff,
  PlusCircle,
  Scale,
  Swords,
  Trophy,
  UserRoundX,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { PlayerLink } from "@/components/PlayerLink";
import { OverdueCheckButton } from "@/components/OverdueCheckButton";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  formatPoints,
  getActiveSeasonId,
  getSeasonLeaderboard,
  restoreSeasonPointsToProfiles,
} from "@/lib/points";
import { MATCH_STATUS_LABELS, SEASON_LABELS } from "@/lib/labels";
import { hasIncompleteRoles } from "@/lib/secondary-roles";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Админка" };

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const viewer = await getSessionUser();
  const seasonId = await getActiveSeasonId();
  if (seasonId) {
    await restoreSeasonPointsToProfiles(seasonId);
  }
  const [students, overdueCount, toReviewCount, openSeason, upcomingMatch, activeSeason, leaderboard] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: "STUDENT" },
        select: { id: true, telegramChatId: true, profile: { select: { primaryRole: true, secondaryRole: true, secondaryRoles: true } } },
      }),
      prisma.homeworkAssignment.count({ where: { status: "OVERDUE" } }),
      prisma.homeworkAssignment.count({ where: { status: "SUBMITTED" } }),
      prisma.ratingSeason.findFirst({ where: { status: "OPEN" } }),
      prisma.matchSession.findFirst({
        where: { status: { in: ["PLANNED", "TEAMS_SET", "LINEUPS_CONFIRMED", "IN_PROGRESS"] } },
        orderBy: { date: "asc" },
        include: { rsvps: { select: { status: true } } },
      }),
      seasonId ? prisma.ratingSeason.findUnique({ where: { id: seasonId } }) : null,
      getSeasonLeaderboard(seasonId),
    ]);

  const noTg = students.filter((s) => !s.telegramChatId).length;
  const noRoles = students.filter((s) => hasIncompleteRoles(s.profile)).length;
  const joined = upcomingMatch?.rsvps?.filter((r) => r.status === "JOINED").length ?? 0;
  const topPlayers = leaderboard.slice(0, 5);
  const seasonTitle = activeSeason ? `${SEASON_LABELS[activeSeason.name]} ${activeSeason.year}` : null;

  const attention = [
    toReviewCount > 0 && {
      href: "/admin/homework",
      icon: ClipboardCheck,
      tone: "admin",
      title: `${toReviewCount} ${plural(toReviewCount, "работа ждёт", "работы ждут", "работ ждут")} проверки`,
      hint: "Домашки → Проверить работы",
    },
    overdueCount > 0 && {
      href: "/admin/homework",
      icon: AlertTriangle,
      tone: "danger",
      title: `${overdueCount} ${plural(overdueCount, "просроченная домашка", "просроченные домашки", "просроченных домашек")}`,
      hint: "Можно напомнить ученикам в Telegram",
    },
    noTg > 0 && {
      href: "/admin/students",
      icon: MessageCircleOff,
      tone: "warning",
      title: `${noTg} ${plural(noTg, "ученик", "ученика", "учеников")} без Telegram`,
      hint: "Им не приходят напоминания и запись на 5v5",
    },
    noRoles > 0 && {
      href: "/admin/students",
      icon: UserRoundX,
      tone: "warning",
      title: `${noRoles} без заполненных ролей`,
      hint: "Роли нужны для балансировки команд",
    },
  ].filter(Boolean) as { href: string; icon: typeof Users; tone: "admin" | "danger" | "warning"; title: string; hint: string }[];

  return (
    <div className="space-y-6 min-[720px]:space-y-8">
      <PageHeader
        eyebrow="Панель тренера"
        title="Дашборд"
        description={seasonTitle ? `Сезон ${seasonTitle}` : "Активного сезона нет"}
      />

      <div className="grid grid-cols-2 gap-2.5 min-[720px]:gap-3 lg:grid-cols-4">
        <Kpi href="/admin/students" icon={Users} label="Учеников" value={students.length} />
        <Kpi
          href="/admin/homework"
          icon={ClipboardList}
          label="На проверке"
          value={toReviewCount}
          tone={toReviewCount > 0 ? "admin" : undefined}
        />
        <Kpi
          href="/admin/homework"
          icon={AlertTriangle}
          label="Просрочено"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : undefined}
        />
        <Kpi
          href="/admin/seasons"
          icon={Trophy}
          label="Голосование"
          value={openSeason ? "Открыто" : "Закрыто"}
          tone={openSeason ? "success" : undefined}
          small
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Требует внимания */}
          <section>
            <h2 className="mb-3 text-[17px] min-[720px]:text-[20px]">Требует внимания</h2>
            {attention.length === 0 ? (
              <div className="surface-card flex items-center gap-3 px-4 py-4 text-sm text-[var(--text-2)]">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--success-bg)] text-[var(--success)]">
                  <BookOpenCheck className="h-5 w-5" aria-hidden />
                </span>
                Всё в порядке — срочных дел нет.
              </div>
            ) : (
              <ul className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
                {attention.map((a) => (
                  <li key={a.title}>
                    <Link href={a.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-muted)]">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          a.tone === "danger" && "bg-[var(--danger-bg)] text-[var(--danger)]",
                          a.tone === "warning" && "bg-[var(--warning-bg)] text-[var(--warning-ink)]",
                          a.tone === "admin" && "bg-[var(--admin-bg)] text-[var(--admin)]"
                        )}
                      >
                        <a.icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-[var(--text)]">{a.title}</span>
                        <span className="block text-[12px] text-[var(--text-3)]">{a.hint}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-3)]" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Ближайший 5v5 */}
          <section>
            <h2 className="mb-3 text-[17px] min-[720px]:text-[20px]">Ближайший 5v5</h2>
            <Link
              href="/admin/matches"
              className="surface-card hover-lift flex items-center gap-4 px-4 py-4 min-[720px]:px-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--admin-bg)] text-[var(--admin)]">
                <Swords className="h-5 w-5" aria-hidden />
              </span>
              {upcomingMatch ? (
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-[var(--text)]">
                    {formatShortDateTime(upcomingMatch.date)}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                    <Badge variant="admin">{MATCH_STATUS_LABELS[upcomingMatch.status]}</Badge>
                    {upcomingMatch.mode === "OPEN_SIGNUP" && (
                      <span className="font-mono-num">записались {joined}/10</span>
                    )}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-[var(--text)]">Матч не запланирован</span>
                  <span className="block text-[12px] text-[var(--text-3)]">Создайте открытую запись или свой состав</span>
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-3)]" aria-hidden />
            </Link>
          </section>

          {/* Быстрые действия */}
          <section>
            <h2 className="mb-3 text-[17px] min-[720px]:text-[20px]">Быстрые действия</h2>
            <div className="grid grid-cols-2 gap-2.5 min-[720px]:grid-cols-3 min-[720px]:gap-3">
              <Action href="/admin/homework" icon={PlusCircle} label="Выдать домашку" />
              <Action href="/admin/matches" icon={Gamepad2} label="Создать 5v5" />
              <Action href="/admin/attendance" icon={CalendarDays} label="Отметить посещение" />
              <Action href="/admin/penalties" icon={Scale} label="Штраф или бонус" />
              <Action href="/admin/materials" icon={BookOpenCheck} label="Добавить материал" />
              <Action href="/admin/lessons" icon={FolderArchive} label="Архив занятий" />
            </div>
          </section>
        </div>

        {/* Топ сезона */}
        <aside className="space-y-6">
          <section>
            <div className="mb-3 flex items-end justify-between gap-2">
              <h2 className="text-[17px] min-[720px]:text-[20px]">Топ сезона</h2>
              <Link href="/stats" className="text-[13px] font-medium text-[var(--admin)] hover:underline">
                Вся таблица →
              </Link>
            </div>
            <ul className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden text-sm">
              {topPlayers.map((p, i) => (
                <li key={p.userId} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "w-5 shrink-0 text-center font-mono-num font-bold",
                      i === 0 ? "text-[var(--gold-ink)]" : "text-[var(--text-3)]"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 overflow-hidden">
                    <PlayerLink
                      user={{ id: p.userId, firstName: p.firstName, lastName: p.lastName, username: p.username, photoUrl: p.photoUrl }}
                      viewer={viewer}
                      avatar={28}
                    />
                  </span>
                  <span className="shrink-0 font-mono-num font-bold text-[var(--points-ink)]">{formatPoints(p.totalPoints)}</span>
                </li>
              ))}
              {topPlayers.length === 0 && <li className="px-4 py-6 text-center text-[var(--text-3)]">Пока нет начислений</li>}
            </ul>
          </section>

          <details className="surface-card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 text-[14px] font-semibold text-[var(--text)] [&::-webkit-details-marker]:hidden">
              Автоматизация
              <ChevronRight className="h-4 w-4 text-[var(--text-3)] transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <div className="space-y-3 border-t border-[var(--border-soft)] px-4 py-4 text-[13px] leading-relaxed text-[var(--text-3)]">
              <p>
                Раз в сутки (08:00 МСК) cron вызывает <Code>/api/cron/automation</Code>: штраф −1 за просроченные
                домашки и автозакрытие сезона по <Code>closesAt</Code>. Нужен <Code>CRON_SECRET</Code>. Вручную —
                кнопкой ниже или <Code>npm run automation</Code>.
              </p>
              <OverdueCheckButton />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function Kpi({
  href,
  icon: Icon,
  label,
  value,
  tone,
  small,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: string | number;
  tone?: "admin" | "danger" | "success";
  small?: boolean;
}) {
  const color =
    tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "admin"
        ? "text-[var(--admin-ink)]"
        : tone === "success"
          ? "text-[var(--success-ink)]"
          : "text-[var(--text)]";
  return (
    <Link href={href} className="surface-card hover-lift block px-3.5 py-3 min-[720px]:px-4 min-[720px]:py-4">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-3)]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      <span
        className={cn(
          "mt-1.5 block font-mono-num font-bold leading-tight",
          small ? "text-[18px] min-[720px]:text-[22px]" : "text-[24px] min-[720px]:text-[28px]",
          color
        )}
      >
        {value}
      </span>
    </Link>
  );
}

function Action({ href, icon: Icon, label }: { href: string; icon: typeof Users; label: string }) {
  return (
    <Link
      href={href}
      className="surface-card press flex items-center gap-2.5 px-3.5 py-3 text-[14px] font-medium text-[var(--text)] transition-colors hover:border-[var(--admin-border)]"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--admin)]" aria-hidden />
      <span className="min-w-0 leading-tight">{label}</span>
    </Link>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-[var(--border)] bg-[var(--control)] px-1 font-mono-num text-[12px] text-[var(--text-2)]">
      {children}
    </code>
  );
}
