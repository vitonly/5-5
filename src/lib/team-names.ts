import { displayName } from "@/lib/utils";

/** Внутренние коды команд в БД — без изменений. */
export type SideCode = "RADIANT" | "DIRE";

type NamedPlayer = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  finalRating?: number | null;
};

/**
 * Название команды: «Team {ник}» игрока с наибольшей силой в составе.
 * При равенстве — первый в списке (стабильный порядок lineup).
 */
export function teamDisplayName(
  players: NamedPlayer[],
  fallback: string = "Team ?"
): string {
  if (!players.length) return fallback;
  let best = players[0];
  let bestPower = best.finalRating ?? 0;
  for (let i = 1; i < players.length; i++) {
    const p = players[i];
    const power = p.finalRating ?? 0;
    if (power > bestPower) {
      best = p;
      bestPower = power;
    }
  }
  const nick = displayName({
    firstName: best.firstName || "",
    lastName: best.lastName,
    username: best.username,
  });
  return nick ? `Team ${nick}` : fallback;
}

export function sideFallback(side: SideCode): string {
  return side === "RADIANT" ? "Team A" : "Team B";
}
