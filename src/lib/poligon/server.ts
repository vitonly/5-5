/*
 * Полигон — серверные помощники: кто может зайти, загрузка попытки, правила таймера.
 */
import { prisma } from "@/lib/db";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { CHAMPIONSHIP_GRACE_MIN, canUsePoligon } from "./core";

/** Текущий пользователь, если ему открыт полигон; иначе null */
export async function getPoligonUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || !canUsePoligon(user)) return null;
  return user;
}

/** Попытка, которую можно смотреть: свою — ученику, любую — тренеру */
export async function findAttemptFor(user: SessionUser, attemptId: string) {
  const attempt = await prisma.poligonAttempt.findUnique({
    where: { id: attemptId },
    include: { user: { select: { id: true, firstName: true, lastName: true, telegramChatId: true, telegramId: true } } },
  });
  if (!attempt) return null;
  if (user.role !== "ADMIN" && attempt.userId !== user.id) return null;
  return attempt;
}

/** Время вышло (для мягкого таймера — просто пометка «вышел за время») */
export function isOverdue(deadlineAt: Date, at: Date = new Date()) {
  return at.getTime() > deadlineAt.getTime();
}

/** В режиме чемпионата после дедлайна + запас на загрузку сдать уже нельзя */
export function isHardClosed(mode: string, deadlineAt: Date, at: Date = new Date()) {
  return mode === "CHAMPIONSHIP" && at.getTime() > deadlineAt.getTime() + CHAMPIONSHIP_GRACE_MIN * 60_000;
}

/** На сколько минут ученик вышел за время (0 — уложился) */
export function overtimeMinutes(deadlineAt: Date, submittedAt: Date | null) {
  if (!submittedAt) return 0;
  return Math.max(0, Math.ceil((submittedAt.getTime() - deadlineAt.getTime()) / 60_000));
}

/** Имя ученика для экранов тренера */
export function fullName(u: { firstName: string; lastName?: string | null }) {
  return `${u.firstName} ${u.lastName ?? ""}`.trim();
}
