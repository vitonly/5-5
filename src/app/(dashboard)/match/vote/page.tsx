import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PLAYER_ROLES } from "@/lib/coach";
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

  // Оценивают учеников и тренера — он тоже играет 5на5
  const students = await prisma.user.findMany({
    where: { role: { in: PLAYER_ROLES } },
    select: publicUserSelect,
    orderBy: { firstName: "asc" },
  });

  return (
    <div>
      <PageHeader eyebrow="Каждую субботу" title="Субботние 5v5" className="mb-5 min-[720px]:mb-6" />
      <MatchNav />
      <VotingClient openSeason={openSeason} students={students} currentUserId={user.id} />
    </div>
  );
}
