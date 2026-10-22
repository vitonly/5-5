import { prisma } from "@/lib/db";
import { displayName } from "@/lib/utils";
import { assessRisk, type RiskStudent } from "@/lib/risk";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Достаёт из базы всё нужное для «зоны риска» и считает её (правила — в src/lib/risk.ts).
 * Берём только последние 30 дней — запросы маленькие даже при большом числе учеников.
 */
export async function findStudentsAtRisk(): Promise<RiskStudent[]> {
  const now = Date.now();
  const [students, assignments, submissions, lessons] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT" },
      select: { id: true, firstName: true, lastName: true, username: true, createdAt: true, studentGroups: { select: { id: true } } },
    }),
    prisma.homeworkAssignment.findMany({
      where: { createdAt: { gte: new Date(now - 30 * DAY) } },
      select: { studentId: true, status: true, createdAt: true },
    }),
    prisma.homeworkSubmission.findMany({
      where: { submittedAt: { gte: new Date(now - 14 * DAY) } },
      select: { studentId: true, submittedAt: true },
    }),
    prisma.lessonSession.findMany({
      where: { date: { gte: new Date(now - 21 * DAY) } },
      select: { date: true, groupId: true, attendances: { where: { present: true }, select: { userId: true } } },
    }),
  ]);

  return assessRisk({
    students: students.map((s) => ({
      id: s.id,
      name: displayName(s),
      groupIds: s.studentGroups.map((g) => g.id),
      createdAt: s.createdAt,
    })),
    assignments,
    submissions,
    lessons: lessons.map((l) => ({ date: l.date, groupId: l.groupId, presentIds: l.attendances.map((a) => a.userId) })),
    now: new Date(now),
  });
}
