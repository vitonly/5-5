import { CardBack, CardFrame } from "@/components/CardFrame";
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

export function PlayerCard({
  user,
  profile,
  size,
  hideName,
}: PlayerCardProps & { size?: number; hideName?: boolean }) {
  const seed = cardSeed(user);
  const design = generateCardDesign(seed, profile.finalRating);

  return (
    <CardFrame
      design={design}
      rating={profile.finalRating}
      firstName={user.firstName || user.username || "Игрок"}
      lastName={user.lastName}
      photoUrl={user.photoUrl}
      size={size}
      hideName={hideName}
    />
  );
}

/** Оборот карточки игрока: те же цвета, что у лицевой стороны, и цифры профиля */
export function PlayerCardBack({
  user,
  profile,
  stats,
  footer,
  size,
}: Pick<PlayerCardProps, "user"> & {
  profile: Pick<PlayerCardProps["profile"], "finalRating">;
  stats: { label: string; value: string }[];
  footer?: string | null;
  size?: number;
}) {
  const design = generateCardDesign(cardSeed(user), profile.finalRating);
  const name = [user.firstName || user.username || "Игрок", user.lastName].filter(Boolean).join(" ");

  return <CardBack design={design} title={name} stats={stats} footer={footer} size={size} />;
}
