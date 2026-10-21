import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { displayName } from "@/lib/utils";
import { cleanSlots, sortSlots } from "@/lib/schedule";
import { handleAuth } from "@/lib/api-auth";

/**
 * Группы учеников. Всё — только для тренера.
 *   GET                         — группы (с составом) и список учеников
 *   POST   { name }             — создать группу
 *   PATCH  { id, name?, memberIds?, schedule? } — переименовать / задать состав / расписание
 *          schedule: [{ weekday: 1..7, time: "18:00" }] — заменяет всё расписание группы
 *   DELETE { id }               — удалить группу (сами ученики остаются)
 */

const MAX_NAME = 60;

async function admin() {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
}

function cleanName(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
}

type GroupRow = {
  id: string;
  name: string;
  members: { id: string }[];
  schedule: { weekday: number; time: string }[];
};

function toJson(g: GroupRow) {
  return {
    id: g.id,
    name: g.name,
    memberIds: g.members.map((m) => m.id),
    schedule: sortSlots(g.schedule.map((s) => ({ weekday: s.weekday, time: s.time }))),
  };
}

async function getHandler() {
  const denied = await admin();
  if (denied) return denied;

  const [groups, students] = await Promise.all([
    prisma.studentGroup.findMany({
      orderBy: { name: "asc" },
      include: { members: { select: { id: true } }, schedule: true },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, username: true, telegramChatId: true, telegramId: true },
    }),
  ]);

  return NextResponse.json({
    groups: groups.map(toJson),
    students: students.map((s) => ({
      id: s.id,
      name: displayName(s),
      hasTelegram: Boolean(s.telegramChatId || s.telegramId),
    })),
  });
}

async function postHandler(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "Введите название группы" }, { status: 400 });

  const exists = await prisma.studentGroup.findUnique({ where: { name } });
  if (exists) return NextResponse.json({ error: "Группа с таким названием уже есть" }, { status: 400 });

  const group = await prisma.studentGroup.create({ data: { name } });
  return NextResponse.json({ group: { id: group.id, name: group.name, memberIds: [], schedule: [] } });
}

async function patchHandler(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const group = await prisma.studentGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });

  const data: { name?: string; members?: { set: { id: string }[] } } = {};

  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "Введите название группы" }, { status: 400 });
    const taken = await prisma.studentGroup.findFirst({ where: { name, id: { not: id } } });
    if (taken) return NextResponse.json({ error: "Группа с таким названием уже есть" }, { status: 400 });
    data.name = name;
  }

  if (body.memberIds !== undefined) {
    if (!Array.isArray(body.memberIds)) {
      return NextResponse.json({ error: "Неверный список учеников" }, { status: 400 });
    }
    // В группу можно добавить только учеников (не тренеров и не выдуманные id)
    const students = await prisma.user.findMany({
      where: { role: "STUDENT", id: { in: body.memberIds.map(String) } },
      select: { id: true },
    });
    data.members = { set: students.map((s) => ({ id: s.id })) };
  }

  // Расписание: старые слоты удаляем, новые записываем — одной транзакцией
  const schedule = body.schedule !== undefined ? cleanSlots(body.schedule) : null;
  const updated = await prisma.$transaction(async (tx) => {
    if (schedule) {
      await tx.groupScheduleSlot.deleteMany({ where: { groupId: id } });
      if (schedule.length) {
        await tx.groupScheduleSlot.createMany({ data: schedule.map((s) => ({ ...s, groupId: id })) });
      }
    }
    return tx.studentGroup.update({
      where: { id },
      data,
      include: { members: { select: { id: true } }, schedule: true },
    });
  });
  return NextResponse.json({ group: toJson(updated) });
}

async function deleteHandler(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const group = await prisma.studentGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });

  await prisma.studentGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PATCH = handleAuth(patchHandler);
export const DELETE = handleAuth(deleteHandler);
