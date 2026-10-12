import Link from "next/link";
import { getSessionUser, getImpersonatorId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { displayName, playerProfilePath } from "@/lib/utils";
import { StopImpersonationButton } from "@/components/StopImpersonationButton";
import { MobileTabBar } from "@/components/MobileTabBar";
import { NavLinks } from "@/components/NavLinks";
import { DesktopNav } from "@/components/DesktopNav";
import { UserMenu } from "@/components/UserMenu";
import { getVotingSeason } from "@/lib/seasons";

const studentLinks = [
  { href: "/homework", label: "Домашки" },
  { href: "/materials", label: "Материалы" },
  { href: "/lessons", label: "Архив" },
  { href: "/match", label: "5x5" },
  { href: "/progress", label: "Мой прогресс" },
  { href: "/rules", label: "Rule book" },
  { href: "/stats", label: "Статистика" },
];

const adminLinks = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/students", label: "Ученики" },
  { href: "/admin/homework", label: "Домашки" },
  { href: "/admin/materials", label: "Материалы" },
  { href: "/admin/lessons", label: "Архив" },
  { href: "/admin/matches", label: "5v5" },
  { href: "/admin/attendance", label: "Посещаемость" },
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
      alsoMatch: [`/player/${user.id}`],
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

  const PRIMARY = isAdmin
    ? ["/admin", "/admin/students", "/admin/homework", "/admin/matches", "/admin/penalties"]
    : ["/homework", "/materials", "/match", "/stats"];

  const desktopItems = navLinks.map((link) => ({
    ...link,
    badge:
      link.href === "/homework" || link.href === "/admin/homework"
        ? pendingHomework
        : link.href === "/match"
          ? pendingVotes
          : 0,
  }));

  const primaryItems = PRIMARY.map((h) => desktopItems.find((i) => i.href === h)!).filter(Boolean);
  const moreItems = desktopItems.filter((i) => !PRIMARY.includes(i.href));

  const mobileStripItems = isAdmin
    ? adminLinks.filter(
        (l) =>
          !["/admin", "/admin/students", "/admin/homework", "/admin/matches", "/admin/penalties"].includes(
            l.href
          )
      )
    : [
        { href: "/progress", label: "Мой прогресс" },
        { href: "/rules", label: "Rule book" },
        { href: "/stats", label: "Статистика" },
        { href: "/lessons", label: "Архив" },
      ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-md backdrop-saturate-150">
        {impersonatorId && (
          <div className="flex items-center justify-center gap-3 bg-[var(--admin-bg)] px-4 py-2 text-sm text-[var(--admin-ink)]">
            <span className="truncate">Вы вошли как ученик: {displayName(user)}</span>
            <StopImpersonationButton />
          </div>
        )}
        <div className="page-shell flex h-14 items-center justify-between gap-4 min-[720px]:h-16">
          <Link
            href={isAdmin ? "/admin" : "/"}
            className="press flex min-w-0 shrink-0 items-center gap-2.5 rounded-[var(--radius-control)]"
            title="На главную"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/start-plus.png?v=2"
              alt=""
              className="h-9 w-9 shrink-0 object-contain min-[720px]:h-10 min-[720px]:w-10"
            />
            <span className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-[var(--text)] min-[720px]:text-[17px]">
              СТАРТ<span className="text-[var(--points)]">+</span>
              <span className="ml-1.5 hidden font-sans text-[13px] font-medium tracking-normal text-[var(--text-3)] min-[1200px]:inline">
                dota2 education
              </span>
            </span>
          </Link>

          {/* desktop nav */}
          <div className="hidden min-w-0 flex-1 justify-center min-[720px]:flex">
            <DesktopNav primary={primaryItems} more={moreItems} />
          </div>

          <UserMenu
            name={displayName(user)}
            firstName={user.firstName}
            lastName={user.lastName}
            photoUrl={user.photoUrl}
            profileHref={isAdmin ? (user.profile ? playerProfilePath(user.id, user) : "/admin") : "/profile"}
            profileLabel={isAdmin ? (user.profile ? "Мой профиль игрока" : "Панель тренера") : "Мой профиль"}
          />
        </div>

        {/* mobile: второстепенные разделы — тонкая лента */}
        <nav
          aria-label="Дополнительные разделы"
          className="no-scrollbar flex gap-1 overflow-x-auto border-t border-[var(--border-soft)] px-3 py-1.5 min-[720px]:hidden"
        >
          <NavLinks items={mobileStripItems} variant="strip" />
        </nav>
      </header>

      <MobileTabBar tabs={isAdmin ? adminTabs : studentTabs} />
    </>
  );
}
