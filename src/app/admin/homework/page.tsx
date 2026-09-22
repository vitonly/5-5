import { prisma } from "@/lib/db";
import { AdminHomeworkClient } from "@/components/AdminHomeworkClient";

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
      <h1 className="mb-6 text-3xl font-bold">Домашние задания</h1>
      <AdminHomeworkClient homeworks={homeworks} students={students} materials={materials} />
    </div>
  );
}
