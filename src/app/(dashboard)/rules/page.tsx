export default function RulesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--text)]">Rule book</h1>
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Правила игр 5×5 и порядок на платформе СТАРТ+. Текст правил появится здесь позже.
        </p>
      </div>

      <section className="space-y-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-display text-lg font-semibold">5×5</h2>
        <p className="text-sm text-[var(--text-3)]">Раздел готовится.</p>
      </section>

      <section className="space-y-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-display text-lg font-semibold">Голосование и сила</h2>
        <p className="text-sm text-[var(--text-3)]">Раздел готовится.</p>
      </section>

      <section className="space-y-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-display text-lg font-semibold">Очки платформы</h2>
        <p className="text-sm text-[var(--text-3)]">Раздел готовится.</p>
      </section>

      <section className="space-y-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-display text-lg font-semibold">Домен, хостинг РФ и ПД</h2>
        <p className="text-sm text-[var(--text-3)]">
          Для тренера: гайд по покупке домена, переносу на серверы в РФ и чеклисту 152-ФЗ лежит в
          репозитории — <code className="text-[var(--text-2)]">docs/HOSTING-RF-AND-PD.md</code>.
        </p>
      </section>
    </div>
  );
}
