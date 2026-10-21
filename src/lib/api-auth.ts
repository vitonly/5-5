import { NextResponse } from "next/server";
import { AuthError } from "@/lib/session";

/**
 * Обёртка для обработчиков API: если внутри requireUser / requireAdmin
 * сказал «не вошёл» или «нет прав», отвечаем 401 / 403 с понятным текстом.
 * Остальные ошибки пропускаем дальше как есть.
 *
 *   async function getHandler(request: NextRequest) { ... }
 *   export const GET = handleAuth(getHandler);
 */
export function handleAuth<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json(
          { error: e.status === 401 ? "Нужно войти на сайт" : "Нет доступа" },
          { status: e.status }
        );
      }
      throw e;
    }
  };
}
