import type { DotaRole } from "@prisma/client";

const VALID: Set<string> = new Set([
  "CARRY",
  "MID",
  "OFFLANE",
  "SUPPORT",
  "HARD_SUPPORT",
]);

/** JSON-массив ролей: индекс 0 = высший приоритет, макс. 3 */
export function parseSecondaryRoles(
  raw: string | null | undefined,
  fallback?: DotaRole | null
): DotaRole[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const roles = parsed
          .filter((r): r is DotaRole => typeof r === "string" && VALID.has(r))
          .slice(0, 3);
        if (roles.length) return roles;
      }
    } catch {
      /* ignore */
    }
  }
  return fallback ? [fallback] : [];
}

export function serializeSecondaryRoles(roles: DotaRole[]): string {
  const unique: DotaRole[] = [];
  for (const r of roles) {
    if (VALID.has(r) && !unique.includes(r)) unique.push(r);
    if (unique.length >= 3) break;
  }
  return JSON.stringify(unique);
}

export function normalizeSecondaryRolesInput(
  input: unknown,
  primaryRole?: DotaRole | null
): DotaRole[] {
  if (!Array.isArray(input)) return [];
  const unique: DotaRole[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !VALID.has(item)) continue;
    const role = item as DotaRole;
    if (primaryRole && role === primaryRole) continue;
    if (unique.includes(role)) continue;
    unique.push(role);
    if (unique.length >= 3) break;
  }
  return unique;
}

/** Нет основной и/или нет доп. ролей — нужно дозаполнить профиль. */
export function hasIncompleteRoles(profile: {
  primaryRole?: DotaRole | null;
  secondaryRole?: DotaRole | null;
  secondaryRoles?: string | null;
} | null | undefined): boolean {
  if (!profile) return true;
  if (!profile.primaryRole) return true;
  return parseSecondaryRoles(profile.secondaryRoles, profile.secondaryRole).length === 0;
}
