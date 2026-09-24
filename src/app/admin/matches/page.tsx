import { prisma } from "@/lib/db";
import { AdminMatchesClient } from "@/components/AdminMatchesClient";

export default async function AdminMatchesPage() {
  const [sessions, students] = await Promise.all([
    prisma.matchSession.findMany({
      include: {
        games: true,
        rsvps: {
          include: { user: true },
          orderBy: [{ status: "asc" }, { respondedAt: "asc" }],
        },
      },
      orderBy: { date: "desc" },
    }),
    prisma.user.findMany({ where: { role: "STUDENT" }, orderBy: { firstName: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">5v5 матчи</h1>
      <AdminMatchesClient sessions={sessions} students={students} />
    </div>
  );
}
