import Link from "next/link";
import { getSessionUser, getImpersonatorId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { displayName, playerProfilePath } from "@/lib/utils";
import { StopImpersonationButton } from "@/components/StopImpersonationButton";
import { MobileTabBar } from "@/components/MobileTabBar";
import { NavLinks } from "@/components/NavLinks";
import { DesktopNav } from "@/components/DesktopNav";
import { UserMenu } from "@/components/UserMenu";
import { HeaderQuickActions } from "@/components/HeaderQuickActions";

const studentLinks = [
  { href: "/homework", label: "Домашки" },
  { href: "/materials", label: "Материалы" },
  { href: "/lessons", label: "Архив" },
  { href: "/match", label: "5v5" },
  { href: "/hall", label: "Зал славы" },
  // «Своя игра» — отдельная служба на сервере (не страница Next.js), открывается по /igra/
  { href: "/igra/", label: "Своя игра" },
  { href: "/progress", label: "Мой прогресс" },
  { href: "/profile?tab=achievements", label: "Ачивки" },
  { href: "/rules", label: "Правила" },
  { href: "/stats", label: "Статистика" },
];

const adminLinksBase = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/students", label: "Ученики" },
  { href: "/admin/groups", label: "Группы" },
  { href: "/admin/homework", label: "Домашки" },
  { href: "/admin/materials", label: "Материалы" },
  { href: "/admin/lessons", label: "Архив" },
  { href: "/admin/matches", label: "5v5" },
  { href: "/admin/attendance", label: "Посещаемость" },
  { href: "/admin/seasons", label: "Сезоны" },
  { href: "/admin/penalties", label: "Очки" },
  { href: "/hall", label: "Зал славы" },
  // Пульт ведущего «Своей игры»
  { href: "/igra/host", label: "Своя игра" },
];

export async function Navbar() {
  const user = await getSessionUser();
  if (!user) return null;

  const impersonatorId = await getImpersonatorId();
  const isAdmin = user.role === "ADMIN";
  const adminLinks = [
    ...adminLinksBase,
    // свой профиль игрока с вкладкой ачивок (если есть карточка)
    ...(user.profile
      ? [{ href: `/player/${user.id}?tab=achievements`, label: "Ачивки" }]
      : []),
    { href: "/api/admin/achievements/rebuild", label: "Пересчёт ачивок" },
  ];
  const navLinks = isAdmin ? adminLinks : studentLinks;

  // У учеников бейдж только на домашках. На 5v5 уведомлений нет
  // (раньше сюда ошибочно вешали недооценённых в сезоне голосования).
  let pendingHomework = 0;

  if (isAdmin) {
    pendingHomework = await prisma.homeworkAssignment.count({
      where: { status: "SUBMITTED" },
    });
  } else {
    pendingHomework = await prisma.homeworkAssignment.count({
      where: {
        studentId: user.id,
        OR: [
          { status: "ASSIGNED" },
          {
            status: "REVISION",
            OR: [
              { revisionDeadline: null },
              { revisionDeadline: { gte: new Date() } },
            ],
          },
        ],
      },
    });
  }

  // Телефон, ученик: 4 основных раздела + «Ещё» (лист со второстепенными)
  const studentTabs = [
    { href: "/", label: "Главная", icon: "home" as const, exact: true },
    {
      href: "/homework",
      label: "Домашки",
      icon: "hw" as const,
      badge: pendingHomework,
    },
    {
      href: "/match",
      label: "5v5",
      icon: "match" as const,
      matchPrefix: "/match",
    },
    { href: "/materials", label: "Материалы", icon: "mat" as const },
  ];
  const studentMore = [
    { href: "/profile", label: "Профиль" },
    { href: "/hall", label: "Зал славы" },
    { href: "/stats", label: "Статистика" },
    { href: "/progress", label: "Мой прогресс" },
    { href: "/rules", label: "Правила" },
    { href: "/lessons", label: "Архив" },
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
    : ["/homework", "/materials", "/match", "/hall", "/stats"];

  const desktopItems = navLinks.map((link) => ({
    ...link,
    badge:
      link.href === "/homework" || link.href === "/admin/homework"
        ? pendingHomework
        : 0,
  }));

  const primaryItems = PRIMARY.map((h) => desktopItems.find((i) => i.href === h)!).filter(Boolean);
  const moreItems = desktopItems.filter((i) => !PRIMARY.includes(i.href));

  // Полоска под шапкой осталась только у тренера; у ученика эти разделы — в «Ещё» нижней панели
  const mobileStripItems = isAdmin
    ? adminLinks.filter(
        (l) =>
          !["/admin", "/admin/students", "/admin/homework", "/admin/matches", "/admin/penalties"].includes(
            l.href
          )
      )
    : [];

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
              src="/brand/start-plus.png?v=3"
              alt=""
              className="h-9 w-9 shrink-0 object-contain min-[720px]:h-10 min-[720px]:w-10"
            />
            <span className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-[var(--text)] min-[720px]:text-[17px]">
              СТАРТ<span className="text-[var(--points)]">+</span>
              <span className="ml-1.5 hidden font-sans text-[13px] font-medium tracking-normal text-[var(--text-3)] min-[1200px]:inline">
                dota 2 education
              </span>
            </span>
          </Link>

          {/* desktop nav */}
          <div className="hidden min-w-0 flex-1 justify-center min-[720px]:flex">
            <DesktopNav primary={primaryItems} more={moreItems} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Голос и чат — в шапке, а не плавающими кнопками поверх контента */}
            <HeaderQuickActions />
            <UserMenu
            name={displayName(user)}
            firstName={user.firstName}
            lastName={user.lastName}
            photoUrl={user.photoUrl}
            profileHref={isAdmin ? (user.profile ? playerProfilePath(user.id, user) : "/admin") : "/profile"}
            profileLabel={isAdmin ? (user.profile ? "Мой профиль игрока" : "Панель тренера") : "Мой профиль"}
            />
          </div>
        </div>

        {/* mobile (тренер): второстепенные разделы — тонкая лента */}
        {mobileStripItems.length > 0 && (
        <nav
          aria-label="Дополнительные разделы"
          className="no-scrollbar flex gap-1 overflow-x-auto border-t border-[var(--border-soft)] px-3 py-1.5 min-[720px]:hidden"
        >
          <NavLinks items={mobileStripItems} variant="strip" />
        </nav>
        )}
      </header>

      <MobileTabBar tabs={isAdmin ? adminTabs : studentTabs} more={isAdmin ? [] : studentMore} />
    </>
  );
}
