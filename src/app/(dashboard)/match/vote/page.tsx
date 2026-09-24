import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { VotingClient } from "@/components/VotingClient";
import { MatchNav } from "@/components/MatchNav";
import { getVotingSeason } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export default async function VotePage() {
  const user = await getSessionUser();
  if (!user) return null;

  const votingSeason = await getVotingSeason();
  const openSeason =
    votingSeason?.status === "OPEN"
      ? await prisma.ratingSeason.findUnique({
          where: { id: votingSeason.id },
          include: {
            peerRatings: { include: { rater: true, target: true } },
            vibeVotes: { include: { voter: true, target: true } },
          },
        })
      : null;

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
    orderBy: { firstName: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Субботние 5v5</h1>
      <MatchNav />
      <VotingClient openSeason={openSeason} students={students} currentUserId={user.id} />
    </div>
  );
}
