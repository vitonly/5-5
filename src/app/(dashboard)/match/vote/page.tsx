import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { VotingClient } from "@/components/VotingClient";
import { MatchNav } from "@/components/MatchNav";

export const dynamic = "force-dynamic";

export default async function VotePage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [openSeason, students] = await Promise.all([
    prisma.ratingSeason.findFirst({
      where: { status: "OPEN" },
      include: {
        peerRatings: { include: { rater: true, target: true } },
        vibeVotes: { include: { voter: true, target: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      include: { profile: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Субботние 5v5</h1>
      <MatchNav />
      <VotingClient openSeason={openSeason} students={students} currentUserId={user.id} />
    </div>
  );
}
