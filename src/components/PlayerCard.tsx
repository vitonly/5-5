import { CardFrame } from "@/components/CardFrame";
import { cardSeed, generateCardDesign } from "@/lib/card-design";
import { displayName } from "@/lib/utils";
import type { DotaRole } from "@prisma/client";

interface PlayerCardProps {
  user: {
    firstName: string;
    lastName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
  };
  profile: {
    mmr?: number | null;
    rankTier?: number | null;
    seasonCoefficient: number;
    finalRating: number;
    primaryRole?: DotaRole | null;
    secondaryRole?: DotaRole | null;
    wins: number;
    losses: number;
    totalPoints: number;
  };
}

function cardName(user: PlayerCardProps["user"]) {
  const full = displayName(user);
  if (full.length <= 14) return full.toUpperCase();
  if (user.lastName) return user.lastName.toUpperCase();
  return user.firstName.toUpperCase();
}

export function PlayerCard({ user, profile }: PlayerCardProps) {
  const name = cardName(user);
  const seed = cardSeed(user);
  const design = generateCardDesign(seed, profile.finalRating);

  return (
    <CardFrame
      design={design}
      rating={profile.finalRating}
      name={name}
      photoUrl={user.photoUrl}
    />
  );
}
