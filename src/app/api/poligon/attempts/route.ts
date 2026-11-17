/*
 * Полигон: начать попытку задания.
 * POST { moduleCode, variantId } → { id }
 * Режим берём из варианта: тренировочное — мягкий таймер, «как на чемпионате» — жёсткий.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon, getModule, getVariant, parseScores, variantTasks } from "@/lib/poligon/core";
import { parseWorkbook, type Workbook } from "@/lib/poligon/a-practicum";
import { isBPractice, reviewBPractice } from "@/lib/poligon/b-practice";

async function postHandler(request: NextRequest) {
  const user = await requireUser();
  if (!canUsePoligon(user)) return NextResponse.json({ error: "Раздел «Профессионалы» тебе пока не открыт" }, { status: 403 });

  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Нужен JSON-объект" }, { status: 400 });
  }
  const body = raw as {
    moduleCode?: string; variantId?: string; learningMode?: unknown; retryFrom?: unknown;
  };
  const mod = getModule(String(body.moduleCode ?? ""));
  const variant = mod ? getVariant(mod, String(body.variantId ?? "")) : null;
  if (!mod || !variant || !mod.ready) return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });

  const practice = isBPractice(variant.id);
  const official = variant.id === "b-official-two-day";
  const workbook: Workbook = {};
  if (practice) {
    const mode = body.learningMode === undefined ? "guided" : body.learningMode;
    if (mode !== "guided" && mode !== "independent" && mode !== "retry") {
      return NextResponse.json({ error: "Неизвестный режим обучения" }, { status: 400 });
    }
    let focus: string[] = [];
    if (mode === "retry") {
      const source = typeof body.retryFrom === "string"
        ? await prisma.poligonAttempt.findFirst({
          where: { id: body.retryFrom, userId: user.id, variantId: variant.id, mode: "PRACTICE", status: { in: ["SUBMITTED", "GRADED"] } },
        }) : null;
      let failedIds: unknown;
      try {
        const report = source && parseWorkbook(source.workbook)._b_report;
        failedIds = typeof report === "string" ? JSON.parse(report).failedIds : null;
      } catch { /* Повреждённый или отсутствующий отчёт не годится для повтора. */ }
      if (source?.status === "GRADED" && Array.isArray(failedIds)) {
        const scores = parseScores(source.scores);
        const weak = variantTasks(mod.code, variant).flatMap(t => t.aspects).filter(a => {
          const value = scores[a.id]?.value;
          return typeof value === "number" && value < (a.type === "S" ? 3 : a.weight);
        }).map(a => a.id);
        const mentorIds = reviewBPractice(source.variantId, parseWorkbook(source.workbook)).checks
          .filter(c => c.aspectIds.some(id => weak.includes(id))).map(c => c.id);
        failedIds = [...failedIds, ...mentorIds];
      }
      if (!source || source.variantId !== variant.id || !isBPractice(source.variantId) || !Array.isArray(failedIds)
        || !failedIds.length || !failedIds.every((id): id is string => typeof id === "string" && id.length > 0)) {
        return NextResponse.json({ error: "Для повтора нужна своя сданная практика с серверным отчётом об ошибках" }, { status: 400 });
      }
      focus = [...new Set(failedIds)];
    }
    workbook._b_seed = randomBytes(8).toString("hex");
    workbook._b_version = "2";
    workbook._b_mode = mode;
    workbook._b_focus = JSON.stringify(focus);
  } else if (official) {
    workbook._b_day = "1";
    workbook._b_source = "official";
  }

  // Возвращаем активную попытку с её исходниками, даже если тренер уже заменил вложения.
  const running = await prisma.poligonAttempt.findFirst({
    where: { userId: user.id, variantId: variant.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (running) return NextResponse.json({ id: running.id });

  // Чемпионат нельзя начинать без прикреплённого Приложения 9.
  if (official) {
    const available = await prisma.poligonVariantFile.findMany({
      where: { variantId: { in: [variant.id, "b-chempionat"] } }, select: { id: true, variantId: true, label: true, url: true }, orderBy: { id: "asc" },
    });
    const assigned = available.filter(f => f.variantId === variant.id);
    const sources = assigned.length ? assigned : available.filter(f => f.variantId === "b-chempionat");
    if (!sources.length) return NextResponse.json({ error: "Тренер ещё не прикрепил Приложение 9" }, { status: 400 });
    // Исходники попытки не меняются при последующей замене вложений тренером.
    workbook._b_sources = JSON.stringify(sources.map((source) => ({ ...source, name: source.label })));
  } else if (mod.code === "b" && variant.kind === "championship"
    && variant.sourceFiles.some((file) => !file.builtinUrl)) {
    const source = await prisma.poligonVariantFile.findFirst({ where: { variantId: variant.id }, select: { id: true } });
    if (!source) return NextResponse.json({ error: "Тренер ещё не прикрепил Приложение 9" }, { status: 400 });
  }

  const now = new Date();
  const attempt = await prisma.poligonAttempt.create({
    data: {
      userId: user.id,
      moduleCode: mod.code,
      variantId: variant.id,
      mode: variant.kind === "championship" ? "CHAMPIONSHIP" : "PRACTICE",
      startedAt: now,
      // Двухдневный прогон: первый день четыре часа, второй запускается отдельно на два.
      deadlineAt: new Date(now.getTime() + variant.minutes * 60_000),
      ...(practice || official ? { workbook: JSON.stringify(workbook) } : {}),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: attempt.id });
}

export const POST = handleAuth(postHandler);
