import Link from "next/link";
import { cn, displayName, playerProfilePath } from "@/lib/utils";

type PlayerUser = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
};

type PlayerLinkProps = {
  user: PlayerUser;
  viewer?: { id: string; role: string } | null;
  className?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

export function PlayerLink({ user, viewer, className, children, onClick }: PlayerLinkProps) {
  return (
    <Link
      href={playerProfilePath(user.id, viewer)}
      className={cn(
      "font-medium text-[var(--points)] transition-colors hover:text-[var(--points-hover)] hover:underline",
      className
    )}
      onClick={onClick}
    >
      {children ?? displayName(user)}
    </Link>
  );
}
