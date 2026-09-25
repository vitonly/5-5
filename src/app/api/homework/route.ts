import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { toJsonArray, formatDate, parseAppDateTime } from "@/lib/utils";
import { applyHomeworkGradedPoints } from "@/lib/points";
import { sendTelegramMessage, notifyChatId } from "@/lib/telegram";

export async function GET() {
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

export async function POST(request: NextRequest) {
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

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const { assignmentId, textAnswer, fileUrls } = body;

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

  // REVISION: обновляем существующий ответ или создаём новый (если предыдущий удалили)
  if (assignment.status === "REVISION" && assignment.submission) {
    const submission = await prisma.homeworkSubmission.update({
      where: { id: assignment.submission.id },
      data: {
        textAnswer: textAnswer || "",
        fileUrls: toJsonArray(fileUrls || []),
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
      textAnswer: textAnswer || "",
      fileUrls: toJsonArray(fileUrls || []),
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

export async function PATCH(request: NextRequest) {
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
