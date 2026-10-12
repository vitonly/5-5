import { PositionBadge } from "@/components/RoleIcon";
import { DOTA_ROLE_LABELS, DOTA_ROLE_POSITION } from "@/lib/labels";
import type { DotaRole } from "@prisma/client";

export const ROLES = Object.keys(DOTA_ROLE_LABELS) as DotaRole[];

/** «Керри (1)» → «Керри» */
export function roleName(r: DotaRole) {
  return DOTA_ROLE_LABELS[r].replace(/\s*\(\d\)\s*$/, "");
}

/** Чип позиции: цветной номер + название — как в составах 5×5 */
export function RoleChipLabel({ role }: { role: DotaRole }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PositionBadge position={DOTA_ROLE_POSITION[role]} className="h-4 w-4 rounded-[4px] text-[10px]" />
      {roleName(role)}
    </span>
  );
}

export function roleFilterItems() {
  return [
    { value: null, label: "Все позиции" },
    ...ROLES.map((r) => ({ value: r, label: <RoleChipLabel role={r} /> })),
  ];
}

/** Пульсирующая красная точка «в эфире» */
export function LiveDot({ className = "h-2.5 w-2.5" }: { className?: string }) {
  return (
    <span className={`relative flex ${className}`} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--danger)] opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex h-full w-full rounded-full bg-[var(--danger)]" />
    </span>
  );
}

/** Пустое состояние для лент */
export function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text?: string }) {
  return (
    <div className="surface-card flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--points-bg)] text-[var(--points)] [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
      <p className="font-medium text-[var(--text)]">{title}</p>
      {text && <p className="mt-1 max-w-[46ch] text-sm text-[var(--text-3)]">{text}</p>}
    </div>
  );
}
