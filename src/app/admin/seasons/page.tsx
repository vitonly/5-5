import { prisma } from "@/lib/db";
import { PLAYER_ROLES } from "@/lib/coach";
import { PageHeader } from "@/components/ui/page-header";
import { AdminSeasonsClient } from "@/components/AdminSeasonsClient";
import { migrateLegacySeasonDeadlines } from "@/lib/seasons";

export const metadata = { title: "Сезоны · Админка" };

export default async function AdminSeasonsPage() {
  await migrateLegacySeasonDeadlines();

  const [seasons, students] = await Promise.all([
    prisma.ratingSeason.findMany({
      include: {
        peerRatings: { include: { rater: true, target: true } },
        vibeVotes: { include: { voter: true, target: true } },
        pointLogs: true,
      },
      orderBy: [{ year: "desc" }, { name: "desc" }],
    }),
    prisma.user.findMany({
      where: { role: { in: PLAYER_ROLES } },   // тренера тоже оценивают
      include: { profile: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader eyebrow="Панель тренера" title="Сезоны" description="Голосование за силу и тильт, дедлайны и закрытие сезона." />
      <AdminSeasonsClient seasons={seasons} students={students} />
    </div>
  );
}
