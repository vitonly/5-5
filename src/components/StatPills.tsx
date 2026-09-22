import { cn } from "@/lib/utils";
import { formatPoints } from "@/lib/points";

export function PointsPill({
  value,
  className,
  showLabel = true,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--points-border)] bg-[var(--points-bg)] px-2.5 text-[var(--points)]",
        className
      )}
    >
      <span
        className="inline-block h-[7px] w-[7px] shrink-0 bg-[var(--points)]"
        style={{ transform: "rotate(45deg)" }}
        aria-hidden
      />
      <span className="font-mono-num text-[13px] font-bold">{formatPoints(value)}</span>
      {showLabel && <span className="text-[11px] font-medium opacity-80">очк.</span>}
    </span>
  );
}

export function PowerPill({
  value,
  className,
  showLabel = true,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--power-border)] bg-[var(--power-bg)] px-2.5 text-[var(--power)]",
        className
      )}
    >
      <span
        className="inline-block h-[9px] w-[9px] shrink-0 rounded-full border-2 border-[var(--power)]"
        aria-hidden
      />
      <span className="font-mono-num text-[13px] font-bold">{value}</span>
      {showLabel && <span className="text-[11px] font-medium opacity-80">сила</span>}
    </span>
  );
}
