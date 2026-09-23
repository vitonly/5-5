import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ProfileForm } from "@/components/ProfileForm";
import { RatingBreakdown } from "@/components/RatingBreakdown";
import { PointHistory } from "@/components/PointHistory";
import { SchoolPointsTile } from "@/components/SchoolPointsTile";
import { TelegramConnect } from "@/components/TelegramConnect";
import { PowerPill } from "@/components/StatPills";
import { ensureTelegramLinkToken, isTelegramLinked } from "@/lib/telegram-links";
import { VIBE_LABELS } from "@/lib/labels";
import type { VibeValue } from "@/lib/rating";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user?.profile) return <p className="text-[var(--text-2)]">Профиль не найден</p>;

  const latestSeason = await prisma.ratingSeason.findFirst({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });

  const [received, vibes, logs] = await Promise.all([
    latestSeason
      ? prisma.peerRating.findMany({
          where: { seasonId: latestSeason.id, targetId: user.id },
          include: { rater: true },
        })
      : Promise.resolve([]),
    latestSeason
      ? prisma.vibeVote.findMany({
          where: { seasonId: latestSeason.id, targetId: user.id },
          include: { voter: true },
        })
      : Promise.resolve([]),
    prisma.pointLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const linkToken = await ensureTelegramLinkToken(user.id);
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || "dota5v5_mygroup_bot";
  const profile = user.profile;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Мой профиль</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Слева — данные игрока. Справа — сила (закрытая) и очки платформы.
        </p>
      </div>

      {!isTelegramLinked(user) && (
        <TelegramConnect linked={false} botUsername={botUsername} linkToken={linkToken} />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <ProfileForm user={user} />

        <div className="space-y-4">
          <div className="rounded-[var(--radius-card)] border border-[var(--power-border)] bg-[var(--power-bg)] p-5">
            <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--power)]">
              Рейтинг силы
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <PowerPill value={profile.finalRating} />
              <span className="text-sm text-[var(--text-2)]">
                SkillMod {profile.skillMod >= 0 ? "+" : ""}
                {profile.skillMod} · VibeMod {profile.vibeMod >= 0 ? "+" : ""}
                {Number(profile.vibeMod).toFixed(1)}
              </span>
            </div>
            <p className="mt-3 text-[12px] text-[var(--text-3)]">
              Виден только тебе и тренеру. В публичном профиле силы нет.
            </p>
          </div>

          <SchoolPointsTile totalPoints={profile.totalPoints} logs={logs} />

          {vibes.length > 0 && (
            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                Вайб от команды
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-2)]">
                {vibes.slice(0, 5).map((v) => (
                  <li key={v.id} className="flex justify-between gap-2">
                    <span>
                      {v.voter.firstName}
                      {v.voter.lastName ? ` ${v.voter.lastName}` : ""}
                    </span>
                    <span className="text-[var(--text)]">
                      {VIBE_LABELS[v.value as VibeValue] ?? v.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <RatingBreakdown
        profile={profile}
        received={received}
        vibes={vibes.map((v) => ({ voter: v.voter, value: v.value as VibeValue }))}
        viewer={user}
      />

      <PointHistory logs={logs} title="История очков" />
    </div>
  );
}
