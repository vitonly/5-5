import { cn } from "@/lib/utils";

type Role = "CARRY" | "MID" | "OFFLANE" | "SUPPORT" | "HARD_SUPPORT";

export const ROLE_POSITION: Record<Role, 1 | 2 | 3 | 4 | 5> = {
  CARRY: 1,
  MID: 2,
  OFFLANE: 3,
  SUPPORT: 4,
  HARD_SUPPORT: 5,
};

/** Цвет позиции — один и тот же на всём сайте (белый текст ≥ 4.5:1). */
const POSITION_BG: Record<number, string> = {
  1: "var(--points)",
  2: "var(--power)",
  3: "var(--admin)",
  4: "var(--success)",
  5: "var(--warning-ink)",
};

const POSITION_NAME: Record<number, string> = {
  1: "Керри",
  2: "Мид",
  3: "Оффлейн",
  4: "Саппорт",
  5: "Хард-саппорт",
};

/** Цветной квадратик с номером позиции 1–5. */
export function PositionBadge({
  position,
  className,
  title,
}: {
  position: number;
  className?: string;
  title?: string;
}) {
  const label = title ?? `Позиция ${position} · ${POSITION_NAME[position] ?? ""}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] font-mono-num text-[11px] font-bold leading-none text-white",
        className
      )}
      style={{ background: POSITION_BG[position] ?? "var(--text-3)" }}
    >
      {position}
    </span>
  );
}

/** Роль Dota 2 → цветной номер позиции. */
export function RoleIcon({
  role,
  className,
  title,
}: {
  role: Role;
  className?: string;
  title?: string;
}) {
  return <PositionBadge position={ROLE_POSITION[role]} className={className} title={title} />;
}
