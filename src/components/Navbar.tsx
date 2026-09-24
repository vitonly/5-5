import Link from "next/link";
import { getSessionUser, getImpersonatorId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { displayName, playerProfilePath } from "@/lib/utils";
import { LogoutButton } from "@/components/LogoutButton";
import { StopImpersonationButton } from "@/components/StopImpersonationButton";
import { MobileTabBar } from "@/components/MobileTabBar";
import { getVotingSeason } from "@/lib/seasons";

const studentLinks = [
  { href: "/", label: "Главная" },
  { href: "/homework", label: "Домашки" },
  { href: "/materials", label: "Материалы" },
  { href: "/match", label: "5x5" },
  { href: "/match/vote", label: "Голосование" },
  { href: "/stats", label: "Статистика" },
];

const adminLinks = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/students", label: "Ученики" },
  { href: "/admin/homework", label: "Домашки" },
  { href: "/admin/materials", label: "Материалы" },
  { href: "/admin/matches", label: "5v5" },
  { href: "/admin/seasons", label: "Сезоны" },
  { href: "/admin/penalties", label: "Очки" },
];

export async function Navbar() {
  const user = await getSessionUser();
  if (!user) return null;

  const impersonatorId = await getImpersonatorId();
  const isAdmin = user.role === "ADMIN";
  const navLinks = isAdmin ? adminLinks : studentLinks;

  let pendingHomework = 0;
  let pendingVotes = 0;

  if (isAdmin) {
    pendingHomework = await prisma.homeworkAssignment.count({
      where: { status: "SUBMITTED" },
    });
  } else {
    const votingSeason = await getVotingSeason();
    const openSeason =
      votingSeason?.status === "OPEN"
        ? await prisma.ratingSeason.findUnique({
            where: { id: votingSeason.id },
            include: {
              peerRatings: { where: { raterId: user.id }, select: { targetId: true } },
              vibeVotes: { where: { voterId: user.id }, select: { targetId: true } },
            },
          })
        : null;

    const [hwCount, students] = await Promise.all([
      prisma.homeworkAssignment.count({
        where: {
          studentId: user.id,
          status: { in: ["ASSIGNED", "OVERDUE", "REVISION"] },
        },
      }),
      openSeason
        ? prisma.user.findMany({
            where: { role: "STUDENT", id: { not: user.id } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    pendingHomework = hwCount;

    if (openSeason && students.length) {
      const skillDone = new Set(openSeason.peerRatings.map((r) => r.targetId));
      const vibeDone = new Set(openSeason.vibeVotes.map((v) => v.targetId));
      for (const s of students) {
        if (!skillDone.has(s.id) || !vibeDone.has(s.id)) pendingVotes++;
      }
    }
  }

  const studentTabs = [
    { href: "/", label: "Главная", icon: "home" as const },
    {
      href: "/homework",
      label: "Домашки",
      icon: "hw" as const,
      badge: pendingHomework,
    },
    { href: "/materials", label: "Материалы", icon: "mat" as const },
    {
      href: "/match",
      label: "5x5",
      icon: "match" as const,
      matchPrefix: "/match",
      badge: pendingVotes,
    },
    {
      href: "/profile",
      label: "Профиль",
      icon: "profile" as const,
      matchPrefix: "/profile",
    },
  ];

  const adminTabs = [
    { href: "/admin", label: "Дашборд", icon: "admin" as const, exact: true },
    { href: "/admin/students", label: "Ученики", icon: "students" as const },
    {
      href: "/admin/homework",
      label: "Домашки",
      icon: "hw" as const,
      badge: pendingHomework,
    },
    {
      href: "/admin/matches",
      label: "5v5",
      icon: "match" as const,
      matchPrefix: "/admin/matches",
    },
    {
      href: "/admin/penalties",
      label: "Очки",
      icon: "points" as const,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        {impersonatorId && (
          <div className="flex items-center justify-center gap-3 bg-[var(--admin-bg)] px-4 py-2 text-sm text-[var(--admin)]">
            <span>Вы вошли как ученик: {displayName(user)}</span>
            <StopImpersonationButton />
          </div>
        )}
        <div className="page-shell flex items-center justify-between gap-3 py-2.5 min-[720px]:py-3">
          <Link href={isAdmin ? "/admin" : "/"} className="font-display text-lg font-bold text-[var(--points)]">
            Dota 5x5
          </Link>

          {/* desktop nav */}
          <nav className="hidden flex-wrap gap-1 min-[720px]:flex">
            {navLinks.map((link) => {
              const badge =
                link.href === "/homework" || link.href === "/admin/homework"
                  ? pendingHomework
                  : link.href === "/match/vote"
                    ? pendingVotes
                    : 0;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative rounded-[var(--radius-control)] px-3 py-2 text-[14px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--control)] hover:text-[var(--text)]"
                >
                  {link.label}
                  {badge > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-[10px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 min-[720px]:gap-3">
            {!isAdmin && pendingVotes > 0 && (
              <Link
                href="/match/vote"
                className="relative flex h-9 items-center rounded-[var(--radius-control)] bg-[var(--points-bg)] px-2.5 text-[12px] font-medium text-[var(--points)] min-[720px]:hidden"
              >
                Голос
                <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-[9px] font-bold text-white">
                  {pendingVotes > 9 ? "9+" : pendingVotes}
                </span>
              </Link>
            )}
            <Link
              href={isAdmin ? "/admin" : playerProfilePath(user.id, user)}
              className="hidden max-w-[140px] truncate text-sm font-medium text-[var(--text)] transition-colors hover:text-[var(--points)] min-[720px]:inline"
            >
              {displayName(user)}
            </Link>
            <LogoutButton />
          </div>
        </div>

        {/* mobile secondary links (stats etc.) — thin strip for students */}
        {!isAdmin && (
          <div className="flex gap-1 overflow-x-auto border-t border-[var(--border-soft)] px-3 py-1.5 min-[720px]:hidden">
            <Link
              href="/match/vote"
              className="shrink-0 rounded-[var(--radius-control)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)]"
            >
              Голосование
              {pendingVotes > 0 && (
                <span className="ml-1 font-mono-num text-[var(--danger)]">{pendingVotes}</span>
              )}
            </Link>
            <Link
              href="/stats"
              className="shrink-0 rounded-[var(--radius-control)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)]"
            >
              Статистика
            </Link>
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-1 overflow-x-auto border-t border-[var(--border-soft)] px-3 py-1.5 min-[720px]:hidden">
            {adminLinks
              .filter(
                (l) =>
                  !["/admin", "/admin/students", "/admin/homework", "/admin/matches", "/admin/penalties"].includes(
                    l.href
                  )
              )
              .map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="shrink-0 rounded-[var(--radius-control)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)]"
                >
                  {l.label}
                </Link>
              ))}
          </div>
        )}
      </header>

      <MobileTabBar tabs={isAdmin ? adminTabs : studentTabs} />
    </>
  );
}
