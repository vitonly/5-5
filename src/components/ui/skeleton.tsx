import { cn } from "@/lib/utils";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("skeleton", className)} style={style} />;
}

/** Заглушка «шапки страницы» на время загрузки */
export function SkeletonHeader({ withTabs = false }: { withTabs?: boolean }) {
  return (
    <div className="mb-6 space-y-3 min-[720px]:mb-8">
      <Skeleton className="h-3 w-24 rounded-full" />
      <Skeleton className="h-8 w-56 min-[720px]:h-10 min-[720px]:w-72" />
      {withTabs && <Skeleton className="mt-5 h-12 w-full rounded-[var(--radius-control)] min-[720px]:w-[420px]" />}
    </div>
  );
}

export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("surface-card space-y-3 p-4 min-[720px]:p-5", className)}>
      <Skeleton className="h-5 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${90 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function SkeletonMediaGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface-card overflow-hidden">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-12 rounded-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-5" />
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[220px]" />
          <Skeleton className="ml-auto h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
