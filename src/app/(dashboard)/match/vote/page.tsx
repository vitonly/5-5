import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { seasonPlayerIds } from "@/lib/season-participants";
import { VotingClient } from "@/components/VotingClient";
import { MatchNav } from "@/components/MatchNav";
import { PageHeader } from "@/components/ui/page-header";
import { getVotingSeason } from "@/lib/seasons";
import { publicUserSelect } from "@/lib/public-user";

export const metadata = { title: "Голосование" };

export const dynamic = "force-dynamic";

export default async function VotePage() {
  const user = await getSessionUser();
  if (!user) return null;

  const votingSeason = await getVotingSeason();
  const openSeason =
    votingSeason?.status === "OPEN"
      ? await prisma.ratingSeason.findUnique({
          where: { id: votingSeason.id },
          // Только свои голоса: чужие оценки и данные аккаунтов на клиент не уходят
          include: {
            peerRatings: { where: { raterId: user.id } },
            vibeVotes: { where: { voterId: user.id } },
          },
        })
      : null;

  // Оценивают только участников голосования: выбранных тренером учеников (или всех) и самого тренера
  const playerIds = openSeason ? await seasonPlayerIds(openSeason) : [];
  const students = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: publicUserSelect,
    orderBy: { firstName: "asc" },
  });
  const notParticipant = Boolean(openSeason) && !playerIds.includes(user.id);

  return (
    <div>
      <PageHeader eyebrow="Каждую субботу" title="Субботние 5v5" className="mb-5 min-[720px]:mb-6" />
      <MatchNav />
      {notParticipant ? (
        <div className="surface-card p-5 text-sm text-[var(--text-2)]">
          В этом голосовании вы не участвуете — тренер выбрал другую группу.
        </div>
      ) : (
        <VotingClient openSeason={openSeason} students={students} currentUserId={user.id} />
      )}
    </div>
  );
}
