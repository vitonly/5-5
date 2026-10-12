import Link from "next/link";
import { Avatar } from "@/components/home/Avatar";
import { cn, displayName, playerProfilePath } from "@/lib/utils";

type PlayerUser = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
};

type PlayerLinkProps = {
  user: PlayerUser;
  viewer?: { id: string; role: string } | null;
  className?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  /** Показать кружок с фото (размер в px; true = 24) */
  avatar?: boolean | number;
};

export function PlayerLink({ user, viewer, className, children, onClick, avatar }: PlayerLinkProps) {
  const size = avatar === true ? 24 : typeof avatar === "number" ? avatar : 0;
  return (
    <Link
      href={playerProfilePath(user.id, viewer)}
      className={cn(
        "font-medium text-[var(--points)] transition-colors hover:text-[var(--points-hover)] hover:underline",
        size > 0 && "inline-flex min-w-0 max-w-full items-center gap-2 hover:no-underline",
        className
      )}
      onClick={onClick}
    >
      {size > 0 && (
        <Avatar photoUrl={user.photoUrl} firstName={user.firstName} lastName={user.lastName} size={size} />
      )}
      {size > 0 ? (
        <span className="min-w-0 truncate hover:underline">{children ?? displayName(user)}</span>
      ) : (
        (children ?? displayName(user))
      )}
    </Link>
  );
}
