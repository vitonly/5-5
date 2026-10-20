import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { displayName } from "@/lib/utils";

/**
 * Группы учеников. Всё — только для тренера.
 *   GET                         — группы (с составом) и список учеников
 *   POST   { name }             — создать группу
 *   PATCH  { id, name?, memberIds? } — переименовать / задать состав
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

export async function GET() {
  const denied = await admin();
  if (denied) return denied;

  const [groups, students] = await Promise.all([
    prisma.studentGroup.findMany({
      orderBy: { name: "asc" },
      include: { members: { select: { id: true } } },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, username: true, telegramChatId: true, telegramId: true },
    }),
  ]);

  return NextResponse.json({
    groups: groups.map((g) => ({ id: g.id, name: g.name, memberIds: g.members.map((m) => m.id) })),
    students: students.map((s) => ({
      id: s.id,
      name: displayName(s),
      hasTelegram: Boolean(s.telegramChatId || s.telegramId),
    })),
  });
}

export async function POST(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "Введите название группы" }, { status: 400 });

  const exists = await prisma.studentGroup.findUnique({ where: { name } });
  if (exists) return NextResponse.json({ error: "Группа с таким названием уже есть" }, { status: 400 });

  const group = await prisma.studentGroup.create({ data: { name } });
  return NextResponse.json({ group: { id: group.id, name: group.name, memberIds: [] } });
}

export async function PATCH(request: NextRequest) {
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

  const updated = await prisma.studentGroup.update({
    where: { id },
    data,
    include: { members: { select: { id: true } } },
  });
  return NextResponse.json({
    group: { id: updated.id, name: updated.name, memberIds: updated.members.map((m) => m.id) },
  });
}

export async function DELETE(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const group = await prisma.studentGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });

  await prisma.studentGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
