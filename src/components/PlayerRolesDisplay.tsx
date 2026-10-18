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
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] py-0.5 pl-0.5 pr-2 text-[var(--text-2)]"
          title={`Основная: ${DOTA_ROLE_LABELS[primary]}`}
        >
          <RoleIcon role={primary} title={`Основная: ${DOTA_ROLE_LABELS[primary]}`} className="rounded-full" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">осн</span>
        </span>
      )}
      {secondary.map((role) => (
        <span
          key={role}
          className="inline-flex items-center"
          title={`Доп: ${DOTA_ROLE_LABELS[role]}`}
        >
          <RoleIcon role={role} title={`Доп: ${DOTA_ROLE_LABELS[role]}`} className="opacity-75" />
        </span>
      ))}
      {!primary && secondary.length > 0 && (
        <span className="text-[11px] text-[var(--danger)]">нет основной — позорник</span>
      )}
    </span>
  );
}
