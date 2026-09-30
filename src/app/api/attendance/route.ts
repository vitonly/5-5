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
  // Normalize to date-only for uniqueness of lesson sessions
  const iso = d.toISOString().slice(0, 10);
  return parseAppDateTime(`${iso}T12:00`);
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
  const { sessionId, userId, present } = body as {
    sessionId?: string;
    userId?: string;
    present?: boolean;
  };

  if (!sessionId || !userId || typeof present !== "boolean") {
    return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
  }

  const session = await prisma.lessonSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return NextResponse.json({ error: "Занятие не найдено" }, { status: 404 });
  }

  const student = await prisma.user.findFirst({
    where: { id: userId, role: "STUDENT" },
  });
  if (!student) {
    return NextResponse.json({ error: "Ученик не найден" }, { status: 404 });
  }

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
        `Посещение занятия ${formatDate(session.date)}`,
        { type: "LESSON_ATTEND", id: attendance.id }
      );
    }

    return NextResponse.json({ ok: true, attendanceId: attendance.id, present: true });
  }

  // Снять отметку → откат очков
  if (existing) {
    await removePointsBySource(userId, "LESSON_ATTEND", existing.id);
    await prisma.lessonAttendance.delete({ where: { id: existing.id } });
  }

  return NextResponse.json({ ok: true, present: false });
}
