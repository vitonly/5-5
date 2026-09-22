import { prisma } from "@/lib/db";
import { AdminPenaltiesClient } from "@/components/AdminPenaltiesClient";

export default async function AdminPenaltiesPage() {
  const [penalties, students] = await Promise.all([
    prisma.penalty.findMany({
      include: { target: true, admin: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "STUDENT" }, orderBy: { firstName: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Очки: штрафы и бонусы</h1>
      <AdminPenaltiesClient penalties={penalties} students={students} />
    </div>
  );
}
