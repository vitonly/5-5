import type { DotaRole } from "@prisma/client";
import { RoleIcon } from "@/components/RoleIcon";
import { DOTA_ROLE_LABELS } from "@/lib/labels";
import { parseSecondaryRoles } from "@/lib/secondary-roles";

type ProfileRoles = {
  primaryRole?: DotaRole | null;
  secondaryRole?: DotaRole | null;
  secondaryRoles?: string | null;
};

/** Основная + до 3 доп. ролей иконками; без ролей — «позорник». */
export function PlayerRolesDisplay({
  profile,
  className = "",
}: {
  profile: ProfileRoles | null | undefined;
  className?: string;
}) {
  if (!profile) {
    return (
      <span className={`text-xs text-[var(--danger)] ${className}`}>
        Роли не выбраны — позорник
      </span>
    );
  }

  // Показываем все доп. роли (до 3) — иначе балансер ставит на скрытую 3-ю, а в UI её нет
  const secondary = parseSecondaryRoles(profile.secondaryRoles, profile.secondaryRole);
  const primary = profile.primaryRole;

  if (!primary && secondary.length === 0) {
    return (
      <span className={`text-xs text-[var(--danger)] ${className}`}>
        Роли не выбраны — позорник
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {primary && (
        <span
          className="inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[var(--text-2)]"
          title={`Основная: ${DOTA_ROLE_LABELS[primary]}`}
        >
          <RoleIcon role={primary} className="h-3.5 w-3.5" />
          <span className="text-[9px] font-medium uppercase tracking-wide">осн</span>
        </span>
      )}
      {secondary.map((role) => (
        <span
          key={role}
          className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[var(--text-3)]"
          title={`Доп: ${DOTA_ROLE_LABELS[role]}`}
        >
          <RoleIcon role={role} className="h-3.5 w-3.5 opacity-80" />
        </span>
      ))}
      {!primary && secondary.length > 0 && (
        <span className="text-[11px] text-[var(--danger)]">нет основной — позорник</span>
      )}
    </span>
  );
}
