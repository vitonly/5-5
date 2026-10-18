import type { Prisma } from "@prisma/client";

/**
 * Поля пользователя, которые можно отдавать в API и в клиентские компоненты.
 * НЕ включать: passwordHash, loginPasswordTemp, telegramLinkToken, login, telegramId/ChatId, vkId —
 * раньше полные записи User уходили ученикам, и через них можно было угнать аккаунт.
 */
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  photoUrl: true,
  role: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
