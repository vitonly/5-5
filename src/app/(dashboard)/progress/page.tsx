import { getSessionUser } from "@/lib/session";
import { ProgressClient } from "@/components/ProgressClient";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const user = await getSessionUser();
  if (!user) return null;

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">Мой прогресс</h1>
      <p className="mb-6 text-sm text-[var(--text-3)]">
        Отмечайте игры и реплеи за день. Тренер видит ваш дневник в профиле. Баллы за это пока не
        начисляются.
      </p>
      {user.role === "STUDENT" ? (
        <ProgressClient />
      ) : (
        <p className="text-sm text-[var(--text-3)]">
          Дневник заполняют ученики. Откройте карточку игрока, чтобы посмотреть его записи.
        </p>
      )}
    </div>
  );
}
