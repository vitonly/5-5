import { CardFrame } from "@/components/CardFrame";
import { cardSeed, generateCardDesign } from "@/lib/card-design";
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

export function PlayerCard({ user, profile }: PlayerCardProps) {
  const seed = cardSeed(user);
  const design = generateCardDesign(seed, profile.finalRating);

  return (
    <CardFrame
      design={design}
      rating={profile.finalRating}
      firstName={user.firstName || user.username || "Игрок"}
      lastName={user.lastName}
      photoUrl={user.photoUrl}
    />
  );
}
