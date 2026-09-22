export interface OpenDotaPlayer {
  profile?: {
    personaname?: string;
    avatarfull?: string;
    account_id?: number;
  };
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
  mmr_estimate?: { estimate?: number | null } | null;
}

export async function fetchOpenDotaPlayer(accountId: number): Promise<OpenDotaPlayer | null> {
  try {
    const res = await fetch(`https://api.opendota.com/api/players/${accountId}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface OpenDotaSummary {
  personaname?: string;
  avatarfull?: string;
  rankTier: number | null;
  mmrEstimate: number | null;
}

export async function fetchOpenDotaSummary(accountId: number): Promise<OpenDotaSummary | null> {
  const player = await fetchOpenDotaPlayer(accountId);
  if (!player) return null;
  return {
    personaname: player.profile?.personaname,
    avatarfull: player.profile?.avatarfull,
    rankTier: player.rank_tier ?? null,
    mmrEstimate: player.mmr_estimate?.estimate ?? null,
  };
}

export function extractSteamIdFromInput(input: string): number | null {
  const trimmed = input.trim();
  const direct = parseInt(trimmed, 10);
  if (!isNaN(direct) && direct > 0 && /^\d+$/.test(trimmed)) return direct;

  const opendotaMatch = trimmed.match(/opendota\.com\/players\/(\d+)/);
  if (opendotaMatch) return parseInt(opendotaMatch[1], 10);

  const dotabuffMatch = trimmed.match(/dotabuff\.com\/players\/(\d+)/);
  if (dotabuffMatch) return parseInt(dotabuffMatch[1], 10);

  return null;
}
