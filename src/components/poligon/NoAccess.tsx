import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

/** Экран для тех, кому тренер ещё не открыл полигон */
export function NoAccess() {
  return (
    <div>
      <PageHeader eyebrow="Профессионалы" title="Полигон" />
      <Card className="p-6 text-[15px] text-[var(--text-2)]">
        Полигон — тренировка к чемпионату «Профессионалы». Доступ открывает тренер. Если ты участвуешь — напиши ему.
      </Card>
    </div>
  );
}
