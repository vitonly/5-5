import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHomeworkClient } from "@/components/AdminHomeworkClient";

export const metadata = { title: "Домашки · Админка" };

export const dynamic = "force-dynamic";

export default async function AdminHomeworkPage() {
  const [homeworks, students, materials] = await Promise.all([
    prisma.homework.findMany({
      include: {
        assignments: {
          include: { student: true, submission: true, homework: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "STUDENT" }, orderBy: { firstName: "asc" } }),
    prisma.learningMaterial.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div>
      <PageHeader eyebrow="Панель тренера" title="Домашние задания" description="Выдавайте задания и проверяйте работы учеников." />
      <AdminHomeworkClient homeworks={homeworks} students={students} materials={materials} />
    </div>
  );
}
