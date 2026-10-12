"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, ShieldCheck, User } from "lucide-react";
import { initials } from "@/lib/format";

/** Аватар с меню: профиль, политика ПД, выход. */
export function UserMenu({
  name,
  firstName,
  lastName,
  photoUrl,
  profileHref,
  profileLabel = "Мой профиль",
}: {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  profileHref: string;
  profileLabel?: string;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const itemCls =
    "flex h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-[14px] text-[var(--text)] outline-none transition-colors data-[highlighted]:bg-[var(--control)] [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-[var(--text-3)]";

  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger
        className="press flex h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1 pl-1 pr-2.5 text-[14px] font-medium text-[var(--text)] transition-colors hover:border-[var(--border-field)] data-[state=open]:border-[var(--border-field)]"
        aria-label="Меню пользователя"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--control)] text-[12px] font-semibold text-[var(--text-2)]">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(firstName, lastName)
          )}
        </span>
        <span className="hidden max-w-[140px] truncate min-[1100px]:inline">{name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--text-3)]" aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={8}
          className="menu-pop z-50 min-w-[220px] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-popover)]"
        >
          <div className="px-3 pb-2 pt-2">
            <p className="truncate text-[14px] font-semibold text-[var(--text)]">{name}</p>
          </div>
          <Dropdown.Separator className="my-1 h-px bg-[var(--border-soft)]" />
          <Dropdown.Item asChild>
            <Link href={profileHref} className={itemCls}>
              <User aria-hidden />
              {profileLabel}
            </Link>
          </Dropdown.Item>
          <Dropdown.Item asChild>
            <Link href="/privacy" className={itemCls}>
              <ShieldCheck aria-hidden />
              Политика ПД
            </Link>
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-[var(--border-soft)]" />
          <Dropdown.Item onSelect={() => void logout()} className={`${itemCls} text-[var(--danger)] [&_svg]:text-[var(--danger)]`}>
            <LogOut aria-hidden />
            Выйти
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
