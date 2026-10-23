import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { toJsonArray, formatDate, parseAppDateTime, parseJsonArray } from "@/lib/utils";
import { applyHomeworkGradedPoints } from "@/lib/points";
import { sendTelegramMessage, notifyChatId } from "@/lib/telegram";
import { handleAuth } from "@/lib/api-auth";

async function getHandler() {
  const user = await requireUser();

  if (user.role === "ADMIN") {
    const homeworks = await prisma.homework.findMany({
      include: {
        assignments: {
          include: {
            student: true,
            submission: true,
            homework: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ homeworks });
  }

  const assignments = await prisma.homeworkAssignment.findMany({
    where: { studentId: user.id },
    include: { homework: true, submission: true },
    orderBy: { deadline: "asc" },
  });

  return NextResponse.json({ assignments });
}

async function postHandler(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, description, studentIds, deadline } = body;

    if (!title || !description || !studentIds?.length || !deadline) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    const homework = await prisma.homework.create({
      data: {
        title: String(title).trim(),
        description: String(description).trim(),
        materialIds: toJsonArray((body.materialIds as string[]) || []),
        assignments: {
          create: studentIds.map((studentId: string) => ({
            studentId,
            deadline: parseAppDateTime(deadline),
          })),
        },
      },
      include: { assignments: true },
    });

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
    });

    await Promise.all(
      students.map((student) =>
        sendTelegramMessage(
          notifyChatId(student),
          `📚 <b>Новая домашка!</b>\n\n<b>${title}</b>\nСрок сдачи: ${formatDate(parseAppDateTime(deadline))}\n\nЗайдите на сайт, чтобы посмотреть задание.`
        )
      )
    );

    return NextResponse.json({ homework });
  } catch (error) {
    console.error("homework POST", error);
    return NextResponse.json(
      { error: "Не удалось создать домашку. Перезапустите сервер после обновления базы." },
      { status: 500 }
    );
  }
}

async function putHandler(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const { assignmentId } = body;
  const textAnswer = String(body.textAnswer ?? "").slice(0, 10_000);   // не длиннее 10 000 символов
  const rawFiles: unknown[] = Array.isArray(body.fileUrls) ? body.fileUrls : [];

  const assignment = await prisma.homeworkAssignment.findUnique({
    where: { id: assignmentId },
    include: { submission: true },
  });

  if (!assignment || assignment.studentId !== user.id) {
    return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });
  }

  if (!["ASSIGNED", "REVISION", "OVERDUE"].includes(assignment.status)) {
    return NextResponse.json({ error: "Сдача недоступна" }, { status: 400 });
  }

  // Файлы ответа: только загруженные на наш сайт (/uploads/…) или уже бывшие в этой сдаче
  // (старые файлы из прежнего хранилища при доработке), и не больше 10.
  // Раньше сюда можно было прислать любые «ссылки», а тренер видел их как файлы ученика.
  const previousFiles = new Set(assignment.submission ? parseJsonArray(assignment.submission.fileUrls) : []);
  const fileOk = (u: unknown) =>
    typeof u === "string" && (/^\/uploads\/[A-Za-z0-9._-]+$/.test(u) || previousFiles.has(u));
  if (rawFiles.length > 10 || !rawFiles.every(fileOk)) {
    return NextResponse.json({ error: "Прикрепить можно до 10 файлов, загруженных на сайт" }, { status: 400 });
  }
  const fileUrls = rawFiles as string[];

  // REVISION: обновляем существующий ответ или создаём новый (если предыдущий удалили)
  if (assignment.status === "REVISION" && assignment.submission) {
    const submission = await prisma.homeworkSubmission.update({
      where: { id: assignment.submission.id },
      data: {
        textAnswer,
        fileUrls: toJsonArray(fileUrls),
        submittedAt: new Date(),
        excellent: false,
        feedback: null,
        gradedAt: null,
      },
    });

    await prisma.homeworkAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "SUBMITTED",
        revisionNote: null,
        revisionDeadline: null,
      },
    });

    return NextResponse.json({ submission });
  }

  if (assignment.submission) {
    return NextResponse.json({ error: "Ответ уже отправлен" }, { status: 400 });
  }

  const submission = await prisma.homeworkSubmission.create({
    data: {
      assignmentId,
      studentId: user.id,
      textAnswer,
      fileUrls: toJsonArray(fileUrls),
    },
  });

  await prisma.homeworkAssignment.update({
    where: { id: assignmentId },
    data: {
      status: "SUBMITTED",
      revisionNote: null,
      revisionDeadline: null,
    },
  });

  return NextResponse.json({ submission });
}

async function patchHandler(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { assignmentId, action } = body;

  if (action === "revision") {
    const { feedback, revisionDeadline } = body;
    if (!revisionDeadline) {
      return NextResponse.json({ error: "Укажите дедлайн доработки" }, { status: 400 });
    }

    const assignment = await prisma.homeworkAssignment.findUnique({
      where: { id: assignmentId },
      include: { submission: true, homework: true, student: true },
    });

    if (!assignment?.submission) {
      return NextResponse.json({ error: "Ответ не найден" }, { status: 404 });
    }

    if (assignment.status !== "SUBMITTED") {
      return NextResponse.json({ error: "Работа не на проверке" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.homeworkAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "REVISION",
          revisionDeadline: parseAppDateTime(revisionDeadline),
          // У доработки свой срок — автонапоминания о нём придут заново
          remindedDayAt: null,
          remindedHourAt: null,
          revisionNote: feedback ? String(feedback).trim() : null,
        },
      }),
    ]);

    await sendTelegramMessage(
      notifyChatId(assignment.student),
      `🔄 <b>Домашка на доработку</b>\n\n<b>${assignment.homework.title}</b>\n${
        feedback ? `Комментарий: ${feedback}\n` : ""
      }Срок доработки: ${formatDate(parseAppDateTime(revisionDeadline))}`
    );

    return NextResponse.json({ success: true });
  }

  const { excellent, feedback } = body;

  const assignment = await prisma.homeworkAssignment.findUnique({
    where: { id: assignmentId },
    include: { submission: true, homework: true },
  });

  if (!assignment?.submission) {
    return NextResponse.json({ error: "Ответ не найден" }, { status: 404 });
  }

  if (assignment.status === "GRADED") {
    // Уже принята — обновляем отзыв, очки не начисляем повторно
    const submission = await prisma.homeworkSubmission.update({
      where: { id: assignment.submission.id },
      data: {
        excellent: Boolean(excellent),
        feedback: feedback || null,
        gradedAt: new Date(),
      },
    });
    return NextResponse.json({ submission, pointsAwarded: false });
  }

  const submission = await prisma.homeworkSubmission.update({
    where: { id: assignment.submission.id },
    data: {
      excellent: Boolean(excellent),
      feedback: feedback || null,
      gradedAt: new Date(),
    },
  });

  await prisma.homeworkAssignment.update({
    where: { id: assignmentId },
    data: { status: "GRADED" },
  });

  await applyHomeworkGradedPoints(
    assignment.studentId,
    Boolean(excellent),
    assignment.homework.title,
    assignmentId
  );

  return NextResponse.json({ submission, pointsAwarded: true });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PUT = handleAuth(putHandler);
export const PATCH = handleAuth(patchHandler);
