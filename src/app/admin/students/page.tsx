import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AdminStudentsClient } from "@/components/AdminStudentsClient";

export const metadata = { title: "Ученики · Админка" };

export default async function AdminStudentsPage() {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
    orderBy: { firstName: "asc" },
  });

  return (
    <div>
      <PageHeader eyebrow="Панель тренера" title="Ученики" description="Профили, доступы для входа, роли и Telegram." />
      <AdminStudentsClient students={students} />
    </div>
  );
}
