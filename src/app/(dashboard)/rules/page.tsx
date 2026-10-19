import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { POINT_VALUES, ROLE_WIN_BONUS } from "@/lib/points";
import { HALL_POINTS } from "@/lib/hall-of-fame";
import { TIER_POINTS } from "@/lib/achievements";

export const metadata = { title: "Правила" };

/*
 * Правила платформы. Цифры очков берутся прямо из кода (points.ts, hall-of-fame.ts, achievements.ts),
 * поэтому при изменении начислений текст обновится сам. Формулировки — черновик, тренер проверяет.
 */

const fmt = (n: number) => (n > 0 ? `+${String(n).replace(".", ",")}` : String(n).replace(".", ",").replace("-", "−"));

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="surface-card scroll-mt-24 space-y-3 p-5 min-[720px]:p-6">
      <h2 className="text-[18px] min-[720px]:text-[20px]">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-[var(--text-2)]">{children}</div>
    </section>
  );
}

function PointsTable({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-[var(--border-soft)] overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-soft)]">
      {rows.map(([what, pts]) => (
        <div key={what} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
          <dt className="min-w-0 text-[var(--text)]">{what}</dt>
          <dd className={`shrink-0 font-mono-num font-semibold ${pts.startsWith("−") ? "text-[var(--danger)]" : "text-[var(--points)]"}`}>
            {pts}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const TOC = [
  ["match", "Субботние 5v5"],
  ["strength", "Сила и голосование"],
  ["points", "Очки"],
  ["seasons", "Сезоны и призы"],
  ["privacy", "Личные данные"],
] as const;

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="СТАРТ+" title="Правила" description="Как проходят 5v5, как считается сила игрока и за что начисляются очки." />

      <nav aria-label="Разделы правил" className="mb-6 flex flex-wrap gap-1.5">
        {TOC.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="press inline-flex h-9 items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[13px] font-medium text-[var(--text-2)] hover:bg-[var(--control)]"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-5">
        <Section id="match" title="Субботние 5v5">
          <p>
            <b className="text-[var(--text)]">Запись.</b> В Telegram приходит приглашение — жми «Я играю». Мест 10; если передумал, нажми «Не играю», чтобы
            место досталось другому.
          </p>
          <p>
            <b className="text-[var(--text)]">Составы.</b> Тренер делит игроков на две команды так, чтобы суммарная сила была примерно равной, и
            раздаёт позиции с учётом ваших ролей. В день обычно две игры, составы на вторую могут меняться.
          </p>
          <p>
            <b className="text-[var(--text)]">Прогнозы.</b> Когда составы утверждены, открываются прогнозы — на сайте и в боте. Голосовать можно до
            старта сессии. Прогноз засчитывается, только если угаданы победители всех игр дня.
          </p>
          <p>
            <b className="text-[var(--text)]">MVP дня.</b> После того как тренер завершит сессию, участники голосуют за лучшего игрока — до конца дня
            по Москве. За себя голосовать нельзя. При равенстве голосов MVP не присуждается. Кто за кого голосовал, видит только тренер.
          </p>
          <p>
            <b className="text-[var(--text)]">Записи игр.</b> После игры тренер загружает демку — по ней считаются статистика, рекорды Зала славы и
            ачивки.
          </p>
        </Section>

        <Section id="strength" title="Сила игрока и голосование">
          <p>Сила — число от 1 до 100. По ней собираются равные команды. Складывается из трёх частей:</p>
          <PointsTable
            rows={[
              ["Медаль в Dota (от Рекрута до Титана)", "1…65"],
              ["Оценка навыков: тренер 50% + ученики 50%", "0…30"],
              ["Устойчивость к тильту", "−5…+5"],
            ]}
          />
          <p>
            Когда тренер открывает голосование сезона, оцени каждого игрока от 0 до 100 и отметь, подвержен ли он тильту. Оценки анонимны.
            Из оценок учеников берётся медиана, а при трёх и более оценках самая высокая и самая низкая отбрасываются — так один голос
            не перекосит результат.
          </p>
          <p>
            Тильт: «не подвержен» немного снижает силу, «подвержен» — повышает. Это не наказание: так в одну команду не собираются
            одни тильтующие.
          </p>
        </Section>

        <Section id="points" title="Очки">
          <p>Очки идут в таблицу сезона. Смотреть их можно в «Статистике», историю начислений — в своём профиле.</p>
          <h3 className="pt-1 text-[15px] font-semibold text-[var(--text)]">5v5</h3>
          <PointsTable
            rows={[
              ["Победа", fmt(POINT_VALUES.MATCH_WIN)],
              ["Вторая победа подряд в тот же день", fmt(POINT_VALUES.MATCH_WIN_STREAK)],
              ["Ничья", fmt(POINT_VALUES.MATCH_DRAW)],
              ["MVP дня", fmt(POINT_VALUES.MVP_DAY)],
            ]}
          />
          <p>
            <b className="text-[var(--text)]">Победа слабее соперника</b> (средняя сила команды ниже на 15 / 25 / 35%) — первая победа дня
            умножается на 1,1 / 1,2 / 1,3.
          </p>
          <p>
            <b className="text-[var(--text)]">Победа не на основной роли</b> добавляет к победе: вторая роль {fmt(ROLE_WIN_BONUS.SECOND)}, третья{" "}
            {fmt(ROLE_WIN_BONUS.THIRD)}, не своя роль {fmt(ROLE_WIN_BONUS.OFF)}.
          </p>

          <h3 className="pt-1 text-[15px] font-semibold text-[var(--text)]">Учёба</h3>
          <PointsTable
            rows={[
              ["Домашка сдана", fmt(POINT_VALUES.HOMEWORK_DONE)],
              ["Домашка на «отлично»", fmt(POINT_VALUES.HOMEWORK_EXCELLENT)],
              ["Домашка не сдана к сроку", fmt(POINT_VALUES.HOMEWORK_OVERDUE)],
              ["Посещение занятия", fmt(POINT_VALUES.LESSON_ATTEND)],
            ]}
          />

          <h3 className="pt-1 text-[15px] font-semibold text-[var(--text)]">Ачивки и Зал славы</h3>
          <PointsTable
            rows={[
              ["Ачивка — бронза", TIER_POINTS[1] ? fmt(TIER_POINTS[1]) : "0"],
              ["Ачивка — серебро", fmt(TIER_POINTS[2])],
              ["Ачивка — золото", fmt(TIER_POINTS[3])],
              ["Рекорд сезона в Зале славы (пока держится)", fmt(HALL_POINTS)],
              ["Антирекорд сезона (пока его не превзойдут)", fmt(-HALL_POINTS)],
            ]}
          />
          <p>Если рекорд побили, очки переходят к новому рекордсмену. Тренер может начислить бонус или штраф вручную — с причиной.</p>
        </Section>

        <Section id="seasons" title="Сезоны и призы">
          <p>
            Очки считаются по сезонам. Топ-3 в конце сезона получают призы. Когда сезон закрывается, текущий счёт обнуляется, а итоговая
            таблица остаётся в архиве. Сумма по всем сезонам показана в колонке «За всё время».
          </p>
          <p>
            <Link href="/stats" className="font-medium text-[var(--points)] underline underline-offset-2">
              Таблица очков →
            </Link>
          </p>
        </Section>

        <Section id="privacy" title="Личные данные">
          <p>
            Согласие на обработку данных запрашивается при входе. Подробности — в{" "}
            <Link href="/privacy" className="font-medium text-[var(--points)] underline underline-offset-2">
              политике конфиденциальности
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
