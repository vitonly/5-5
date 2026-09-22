import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { StudentHomeworkList } from "@/components/StudentHomeworkList";

export const dynamic = "force-dynamic";

export default async function HomeworkPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [assignments, materials] = await Promise.all([
    prisma.homeworkAssignment.findMany({
      where: { studentId: user.id },
      include: { homework: true, submission: true },
      orderBy: { deadline: "asc" },
    }),
    prisma.learningMaterial.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Домашние задания</h1>
      <StudentHomeworkList assignments={assignments} materials={materials} />
    </div>
  );
}
