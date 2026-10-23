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

/**
 * Копия пользователя без секретов — для передачи в клиентские компоненты,
 * когда нужен почти весь объект (например, форма своего профиля).
 * Всё, что попадает в клиентский компонент, оказывается в коде страницы в браузере:
 * раньше так в «Профиль» уходили хеш пароля, временный пароль и токен привязки Telegram.
 */
export function withoutSecrets<T extends { passwordHash?: string | null; loginPasswordTemp?: string | null; telegramLinkToken?: string | null }>(
  user: T
): T {
  return { ...user, passwordHash: null, loginPasswordTemp: null, telegramLinkToken: null };
}
