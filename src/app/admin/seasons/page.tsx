import { prisma } from "@/lib/db";
import { AdminSeasonsClient } from "@/components/AdminSeasonsClient";

export default async function AdminSeasonsPage() {
  const [seasons, students] = await Promise.all([
    prisma.ratingSeason.findMany({
      include: {
        peerRatings: { include: { rater: true, target: true } },
        vibeVotes: { include: { voter: true, target: true } },
      },
      orderBy: [{ year: "desc" }, { name: "desc" }],
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      include: { profile: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Сезоны</h1>
      <AdminSeasonsClient seasons={seasons} students={students} />
    </div>
  );
}
