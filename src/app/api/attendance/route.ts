import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { parseAppDateTime, formatDateOnly } from "@/lib/utils";
import {
  POINT_VALUES,
  addPoints,
  removePointsBySource,
} from "@/lib/points";
import { handleAuth } from "@/lib/api-auth";

function startOfDayMoscow(d: Date) {
  const iso = d.toISOString().slice(0, 10);
  return parseAppDateTime(`${iso}T12:00`);
}

type AttendanceUpdate = { userId: string; present: boolean };

async function applyAttendanceUpdate(
  sessionId: string,
  sessionDate: Date,
  userId: string,
  present: boolean
) {
  const student = await prisma.user.findFirst({
    where: { id: userId, role: "STUDENT" },
    select: { id: true },
  });
  if (!student) return { userId, present: false, error: "Ученик не найден" };

  const existing = await prisma.lessonAttendance.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });

  if (present) {
    const attendance =
      existing ??
      (await prisma.lessonAttendance.create({
        data: { sessionId, userId, present: true },
      }));

    if (existing && !existing.present) {
      await prisma.lessonAttendance.update({
        where: { id: existing.id },
        data: { present: true },
      });
    }

    const alreadyAwarded = await prisma.pointLog.findFirst({
      where: {
        userId,
        sourceType: "LESSON_ATTEND",
        sourceId: attendance.id,
      },
    });
    if (!alreadyAwarded) {
      await addPoints(
        userId,
        POINT_VALUES.LESSON_ATTEND,
        `Посещение занятия ${formatDateOnly(sessionDate)}`,
        { type: "LESSON_ATTEND", id: attendance.id }
      );
    }

    return { userId, present: true, attendanceId: attendance.id };
  }

  if (existing) {
    await removePointsBySource(userId, "LESSON_ATTEND", existing.id);
    await prisma.lessonAttendance.delete({ where: { id: existing.id } });
  }

  return { userId, present: false };
}

async function getHandler() {
  await requireAdmin();

  // One-time cleanup: attendance reasons should be date-only (no "в 12:00")
  await prisma.$executeRawUnsafe(`
    UPDATE "PointLog"
    SET reason = regexp_replace(reason, ' в [0-9]{1,2}:[0-9]{2}$', '')
    WHERE "sourceType" = 'LESSON_ATTEND'
      AND reason ~ ' в [0-9]{1,2}:[0-9]{2}$'
  `);

  const sessions = await prisma.lessonSession.findMany({
    orderBy: { date: "desc" },
    include: {
      attendances: { include: { user: true } },
      group: { select: { id: true, name: true } },
    },
    take: 40,
  });
  // Группы с составом и расписанием: занятие можно открыть для группы
  const groups = await prisma.studentGroup.findMany({
    orderBy: { name: "asc" },
    include: { members: { select: { id: true } }, schedule: true },
  });
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    orderBy: { firstName: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      photoUrl: true,
    },
  });
  return NextResponse.json({
    sessions,
    students,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      memberIds: g.members.map((m) => m.id),
      schedule: g.schedule.map((s) => ({ weekday: s.weekday, time: s.time })),
    })),
  });
}

async function postHandler(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json();
  const { date } = body as { date?: string };
  // Занятие группы (пусто — для всех учеников)
  const groupId = body.groupId ? String(body.groupId) : null;
  if (groupId && !(await prisma.studentGroup.findUnique({ where: { id: groupId } }))) {
    return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
  }
  if (!date) {
    return NextResponse.json({ error: "Укажите дату" }, { status: 400 });
  }
  const day = startOfDayMoscow(parseAppDateTime(date.includes("T") ? date : `${date}T12:00`));

  const existing = await prisma.lessonSession.findFirst({
    where: {
      date: {
        gte: new Date(day.getTime() - 12 * 3600 * 1000),
        lt: new Date(day.getTime() + 12 * 3600 * 1000),
      },
      // В один день у разных групп — разные занятия
      groupId,
    },
  });
  if (existing) {
    return NextResponse.json({ session: existing, existed: true });
  }

  const session = await prisma.lessonSession.create({
    data: { date: day, createdById: admin.id, groupId },
  });
  return NextResponse.json({ session, existed: false });
}

async function putHandler(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { sessionId } = body as { sessionId?: string };

  if (!sessionId) {
    return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
  }

  const updates: AttendanceUpdate[] = Array.isArray(body.updates)
    ? body.updates
    : body.userId != null && typeof body.present === "boolean"
      ? [{ userId: body.userId, present: body.present }]
      : [];

  if (updates.length === 0) {
    return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
  }

  const session = await prisma.lessonSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return NextResponse.json({ error: "Занятие не найдено" }, { status: 404 });
  }

  // Last write wins per userId within the same batch
  const byUser = new Map<string, boolean>();
  for (const u of updates) {
    if (u?.userId && typeof u.present === "boolean") {
      byUser.set(u.userId, u.present);
    }
  }

  const results = [];
  for (const [userId, present] of byUser) {
    results.push(await applyAttendanceUpdate(sessionId, session.date, userId, present));
  }

  const refreshed = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: { attendances: { include: { user: true } }, group: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ ok: true, results, session: refreshed });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PUT = handleAuth(putHandler);
