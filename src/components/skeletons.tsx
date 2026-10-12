import { Skeleton, SkeletonCard, SkeletonHeader, SkeletonMediaGrid, SkeletonRows } from "@/components/ui/skeleton";

/* Скелетоны страниц — повторяют раскладку настоящих страниц, чтобы ничего не прыгало */

function Tiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 min-[720px]:grid-cols-4 min-[720px]:gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface-card space-y-2 px-3.5 py-3">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

function Pennant({ big = false }: { big?: boolean }) {
  return (
    <Skeleton
      className={
        big
          ? "aspect-[25/32] w-[118px] rounded-[var(--radius-card)] min-[400px]:w-[132px] min-[720px]:w-[250px]"
          : "aspect-[53/70] w-[98px] rounded-[var(--radius-card)] min-[400px]:w-[110px] min-[720px]:w-[212px]"
      }
    />
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-10 min-[720px]:space-y-14">
      <div>
        <div className="mb-6 flex flex-col items-center gap-3 min-[720px]:mb-10">
          <Skeleton className="h-3 w-40 rounded-full" />
          <Skeleton className="h-8 w-56 min-[720px]:h-12 min-[720px]:w-80" />
        </div>
        <div className="flex items-end justify-center gap-2.5 min-[400px]:gap-3.5 min-[720px]:gap-10 xl:gap-14">
          <div className="pb-1.5 min-[720px]:pb-2">
            <Pennant />
          </div>
          <div className="pb-5 min-[720px]:pb-10">
            <Pennant big />
          </div>
          <Pennant />
        </div>
      </div>
      <Skeleton className="h-[120px] w-full rounded-[var(--radius-card)]" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-44" />
        <SkeletonMediaGrid count={3} />
      </div>
    </div>
  );
}

export function HomeworkSkeleton() {
  return (
    <div>
      <SkeletonHeader />
      <div className="space-y-5">
        <Tiles />
        <Skeleton className="h-12 w-full min-[720px]:w-[380px]" />
        <div className="space-y-3">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
      </div>
    </div>
  );
}

function Chips({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-8 shrink-0 rounded-full" style={{ width: 70 + ((i * 23) % 40) }} />
      ))}
    </div>
  );
}

export function MaterialsSkeleton() {
  return (
    <div>
      <SkeletonHeader />
      <div className="space-y-6">
        <Skeleton className="h-12 w-full min-[720px]:w-[320px]" />
        <div className="space-y-2.5">
          <Chips count={3} />
          <Chips />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <SkeletonMediaGrid count={6} />
        </div>
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div>
      <SkeletonHeader />
      <div className="mb-6">
        <Chips count={3} />
      </div>
      <div className="mb-6">
        <Tiles />
      </div>
      <Skeleton className="mb-3 h-5 w-64" />
      <SkeletonRows count={10} />
    </div>
  );
}

function MatchNavSkeleton() {
  return <Skeleton className="mb-6 h-[52px] w-full min-[720px]:w-[400px]" />;
}

export function MatchSkeleton() {
  return (
    <div>
      <SkeletonHeader />
      <MatchNavSkeleton />
      <div className="surface-card space-y-5 p-4 min-[720px]:p-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-2 min-[720px]:grid-cols-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function VoteSkeleton() {
  return (
    <div>
      <SkeletonHeader />
      <MatchNavSkeleton />
      <div className="space-y-4">
        <Skeleton className="h-[96px] w-full rounded-[var(--radius-card)]" />
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Skeleton className="h-[76px] rounded-[var(--radius-card)] lg:h-[420px]" />
          <SkeletonCard lines={6} className="min-h-[420px]" />
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="surface-card grid gap-5 p-4 min-[720px]:grid-cols-[220px_1fr] min-[720px]:p-6">
        <Skeleton className="mx-auto aspect-[3/4] w-[160px] rounded-[var(--radius-card)] min-[720px]:w-[220px]" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </div>
      </div>
      <Skeleton className="h-12 w-full min-[720px]:w-[480px]" />
      <div className="grid gap-4 min-[720px]:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}

export function GenericSkeleton() {
  return (
    <div>
      <SkeletonHeader />
      <div className="space-y-3">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
