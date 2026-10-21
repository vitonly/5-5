import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

const lessonInclude = {
  files: { orderBy: { createdAt: "asc" as const } },
};

async function getHandler() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lessons = await prisma.lessonArchive.findMany({
    where: user.role === "ADMIN" ? undefined : { isOpen: true },
    orderBy: { createdAt: "desc" },
    include: lessonInclude,
  });
  return NextResponse.json({ lessons });
}

type FileInput = {
  name?: string;
  url?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

function normalizeFiles(files: FileInput[] | undefined) {
  return (files ?? [])
    .map((f) => ({
      name: String(f.name ?? "").trim() || "файл",
      url: String(f.url ?? "").trim(),
      mimeType: f.mimeType ? String(f.mimeType) : null,
      sizeBytes: typeof f.sizeBytes === "number" ? f.sizeBytes : null,
    }))
    .filter((f) => f.url);
}

async function postHandler(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    title?: string;
    description?: string;
    files?: FileInput[];
    isOpen?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  }

  const files = normalizeFiles(body.files);

  const lesson = await prisma.lessonArchive.create({
    data: {
      title,
      description,
      isOpen: Boolean(body.isOpen),
      files: files.length ? { create: files } : undefined,
    },
    include: lessonInclude,
  });

  return NextResponse.json({ lesson });
}

async function patchHandler(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    id?: string;
    title?: string;
    description?: string;
    files?: FileInput[];
    isOpen?: boolean;
    action?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Не указано занятие" }, { status: 400 });
  }

  // Быстрый переключатель «открыть / закрыть для учеников»
  if (body.action === "setOpen" || (body.isOpen !== undefined && body.title === undefined)) {
    const lesson = await prisma.lessonArchive.update({
      where: { id },
      data: { isOpen: Boolean(body.isOpen) },
      include: lessonInclude,
    });
    return NextResponse.json({ lesson });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  }

  const files = normalizeFiles(body.files);

  const lesson = await prisma.$transaction(async (tx) => {
    await tx.lessonArchiveFile.deleteMany({ where: { lessonId: id } });
    return tx.lessonArchive.update({
      where: { id },
      data: {
        title,
        description,
        ...(body.isOpen !== undefined ? { isOpen: Boolean(body.isOpen) } : {}),
        files: files.length ? { create: files } : undefined,
      },
      include: lessonInclude,
    });
  });

  return NextResponse.json({ lesson });
}

async function deleteHandler(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Не указано занятие" }, { status: 400 });
  }

  await prisma.lessonArchive.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PATCH = handleAuth(patchHandler);
export const DELETE = handleAuth(deleteHandler);
