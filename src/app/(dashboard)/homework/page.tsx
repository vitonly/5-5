import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { StudentHomeworkList } from "@/components/StudentHomeworkList";
import { PageHeader } from "@/components/ui/page-header";
import { POINT_VALUES, formatPoints, getActiveSeasonId, roundPoints } from "@/lib/points";

export const metadata = { title: "Домашние задания" };

export const dynamic = "force-dynamic";

/** Время рендера: серверный компонент рендерится на каждый запрос */
function renderTime() {
  return Date.now();
}

export default async function HomeworkPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const seasonId = await getActiveSeasonId();
  const [assignments, materials, homeworkLogs] = await Promise.all([
    prisma.homeworkAssignment.findMany({
      where: { studentId: user.id },
      include: { homework: true, submission: true },
      orderBy: { deadline: "asc" },
    }),
    prisma.learningMaterial.findMany({ orderBy: { createdAt: "desc" } }),
    // Настоящие начисления за домашки в текущем сезоне — те же, что идут в очки ученика
    seasonId
      ? prisma.pointLog.findMany({
          where: { userId: user.id, seasonId, reason: { startsWith: "Домашка «" } },
          select: { delta: true },
        })
      : Promise.resolve([]),
  ]);
  const homeworkPoints = {
    earned: roundPoints(homeworkLogs.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0)),
    penalty: roundPoints(homeworkLogs.filter((l) => l.delta < 0).reduce((s, l) => s + l.delta, 0)),
  };

  return (
    <div>
      <PageHeader
        eyebrow="Учёба"
        title="Домашние задания"
        description={`Сдавайте до дедлайна: за принятую работу +${formatPoints(POINT_VALUES.HOMEWORK_DONE)} очка, за отличную — +${formatPoints(POINT_VALUES.HOMEWORK_EXCELLENT)}.`}
      />
      <StudentHomeworkList
        assignments={assignments}
        materials={materials}
        homeworkPoints={homeworkPoints}
        now={renderTime()}
      />
    </div>
  );
}
