import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AdminPenaltiesClient } from "@/components/AdminPenaltiesClient";

export const metadata = { title: "Штрафы · Админка" };

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
      <PageHeader eyebrow="Панель тренера" title="Штрафы и бонусы" description="Ручная корректировка очков с указанием причины." />
      <AdminPenaltiesClient penalties={penalties} students={students} />
    </div>
  );
}
