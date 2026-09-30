import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Политика конфиденциальности · СТАРТ+",
  description: "Обработка персональных данных на платформе СТАРТ+ dota2 education",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <p className="text-sm text-[var(--text-4)]">
          <Link href="/login" className="text-[var(--points)] hover:underline">
            ← Вход
          </Link>
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-[var(--text)]">
          Политика конфиденциальности
        </h1>
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Платформа «СТАРТ+ dota2 education». Документ носит информационный характер и не заменяет
          юридическую консультацию. Актуальная редакция: октябрь 2026.
        </p>
      </div>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">1. Оператор</h2>
        <p>
          Оператором обработки персональных данных является владелец платформы (тренер / ИП / ООО —
          укажите реквизиты при необходимости). По вопросам ПД пишите тренеру в Telegram или через
          чат на сайте.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">
          2. Какие данные обрабатываются
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>идентификаторы Telegram (ID, username), имя и фото профиля;</li>
          <li>логин (если выдан тренером) и данные сессии (cookie);</li>
          <li>учебные данные: домашки, материалы, оценки, очки, посещаемость, дневник прогресса;</li>
          <li>данные матчей 5v5, голосования по силе и эмоциональной устойчивости;</li>
          <li>сообщения и вложения в чате ученик ↔ тренер;</li>
          <li>загруженные файлы (аватары, ответы на домашки, скриншоты).</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">3. Цели обработки</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>организация обучения Dota 2 и проверка домашних заданий;</li>
          <li>проведение тренировочных 5v5, рейтинга и статистики;</li>
          <li>связь ученика с тренером;</li>
          <li>обеспечение безопасности входа и работы платформы.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">4. Правовые основания</h2>
        <p>
          Согласие субъекта персональных данных (ст. 6, 9 152-ФЗ — в применимой части), а также
          исполнение договора / оказание образовательных услуг по запросу пользователя.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">5. Хранение и передача</h2>
        <p>
          Данные хранятся на серверах, используемых платформой (в том числе облачные сервисы). При
          переносе инфраструктуры в РФ политика будет обновлена. Передача третьим лицам — только в
          объёме, необходимом для работы сервисов (хостинг, БД, хранилище файлов, Telegram Bot API).
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">6. Cookies и сессии</h2>
        <p>
          Используются httpOnly-cookie сессии для входа. Аналитические трекеры сторонних рекламных
          сетей не подключаются по умолчанию.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">7. Права пользователя</h2>
        <p>
          Вы можете запросить уточнение, блокирование или удаление своих данных, отозвать согласие
          (это может сделать невозможным дальнейшее использование платформы). Обращайтесь к
          оператору / тренеру.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">8. Срок хранения</h2>
        <p>
          Данные хранятся, пока вы пользуетесь платформой и пока это нужно для целей обучения, либо
          до удаления по вашему запросу / решению оператора, если иное не требуется законом.
        </p>
      </section>

      <p className="text-xs text-[var(--text-4)]">
        См. также технический гайд для оператора:{" "}
        <code className="text-[var(--text-3)]">docs/HOSTING-RF-AND-PD.md</code> в репозитории.
      </p>
    </main>
  );
}
