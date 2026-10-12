import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Avatar({
  photoUrl,
  firstName,
  lastName,
  size = 32,
  className,
}: {
  photoUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--control)] font-semibold text-[var(--text-2)] ring-1 ring-[var(--border)]",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(firstName, lastName)
      )}
    </span>
  );
}
