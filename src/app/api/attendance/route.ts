import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { parseAppDateTime, formatDate } from "@/lib/utils";
import {
  POINT_VALUES,
  addPoints,
  removePointsBySource,
} from "@/lib/points";

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
        `Посещение занятия ${formatDate(sessionDate)}`,
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

export async function GET() {
  await requireAdmin();
  const sessions = await prisma.lessonSession.findMany({
    orderBy: { date: "desc" },
    include: {
      attendances: { include: { user: true } },
    },
    take: 40,
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
  return NextResponse.json({ sessions, students });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json();
  const { date } = body as { date?: string };
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
    },
  });
  if (existing) {
    return NextResponse.json({ session: existing, existed: true });
  }

  const session = await prisma.lessonSession.create({
    data: { date: day, createdById: admin.id },
  });
  return NextResponse.json({ session, existed: false });
}

export async function PUT(request: NextRequest) {
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
    include: { attendances: { include: { user: true } } },
  });

  return NextResponse.json({ ok: true, results, session: refreshed });
}
