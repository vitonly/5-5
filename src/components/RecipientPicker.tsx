"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* Выбор получателей рассылки: «Все», группа или отдельные ученики.
   Один и тот же компонент стоит везде, где тренер что-то отправляет ученикам
   (домашка, запись на 5v5, напоминания). На выходе — просто список id учеников. */

export type RecipientGroup = {
  id: string;
  name: string;
  memberIds: string[];
  /** Расписание группы: дни недели (1 — пн … 7 — вс) и время */
  schedule?: { weekday: number; time: string }[];
};
export type RecipientStudent = { id: string; name: string; hasTelegram: boolean };

/** Загружает группы и учеников один раз при открытии страницы */
export function useRecipients() {
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [students, setStudents] = useState<RecipientStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/groups")
      .then((r) => (r.ok ? r.json() : { groups: [], students: [] }))
      .then((d) => {
        if (!alive) return;
        setGroups(d.groups ?? []);
        setStudents(d.students ?? []);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { groups, students, loading };
}

const chip = "rounded-full border px-3 py-1 text-xs transition-colors";
const chipOn = "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-ink)]";
const chipOff = "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]";

export function RecipientPicker({
  students,
  groups,
  value,
  onChange,
  requireTelegram = false,
}: {
  students: RecipientStudent[];
  groups: RecipientGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Рассылка идёт в Telegram — ученики без привязанного Telegram недоступны для выбора */
  requireTelegram?: boolean;
}) {
  // Кого вообще можно выбрать
  const eligible = useMemo(
    () => students.filter((s) => !requireTelegram || s.hasTelegram).map((s) => s.id),
    [students, requireTelegram]
  );
  const selected = new Set(value);
  const allOn = eligible.length > 0 && eligible.every((id) => selected.has(id));

  function setAll() {
    onChange(allOn ? [] : eligible);
  }

  // Группа «включена», если выбраны все её ученики (из тех, кого можно выбрать)
  function groupMembers(g: RecipientGroup) {
    const ok = new Set(eligible);
    return g.memberIds.filter((id) => ok.has(id));
  }
  function groupOn(g: RecipientGroup) {
    const m = groupMembers(g);
    return m.length > 0 && m.every((id) => selected.has(id));
  }
  function toggleGroup(g: RecipientGroup) {
    const m = groupMembers(g);
    if (groupOn(g)) onChange(value.filter((id) => !m.includes(id)));
    else onChange([...new Set([...value, ...m])]);
  }

  function toggleStudent(id: string) {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={setAll} className={cn(chip, "font-medium", allOn ? chipOn : chipOff)}>
          Все
        </button>
        {groups.map((g) => {
          const count = groupMembers(g).length;
          return (
            <button
              key={g.id}
              type="button"
              disabled={count === 0}
              onClick={() => toggleGroup(g)}
              title={count === 0 ? "В группе нет учеников, которым можно отправить" : undefined}
              className={cn(
                chip,
                "inline-flex items-center gap-1 font-medium",
                count === 0 ? "cursor-not-allowed opacity-40 " + chipOff : groupOn(g) ? chipOn : chipOff
              )}
            >
              <Users className="h-3 w-3" aria-hidden />
              {g.name} · {count}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {students.map((s) => {
          const blocked = requireTelegram && !s.hasTelegram;
          return (
            <button
              key={s.id}
              type="button"
              disabled={blocked}
              onClick={() => toggleStudent(s.id)}
              title={blocked ? "Нет привязанного Telegram" : undefined}
              className={cn(chip, blocked ? "cursor-not-allowed opacity-40 " + chipOff : selected.has(s.id) ? chipOn : chipOff)}
            >
              {s.name}
              {blocked ? " · нет TG" : ""}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-3)]">
        Выбрано: {value.length} из {eligible.length}
        {groups.length === 0 && " · группы можно создать в разделе «Группы»"}
      </p>
    </div>
  );
}

/**
 * Окно «Кому отправить» для кнопок рассылки.
 * По умолчанию выбраны все. onSend получает null, если выбраны все
 * (сервер разошлёт как раньше), или список выбранных id.
 */
export function SendToDialog({
  open,
  title,
  hint,
  sendLabel = "Отправить",
  requireTelegram = true,
  busy = false,
  initial = null,
  allLabel,
  onClose,
  onSend,
}: {
  open: boolean;
  title: string;
  hint?: string;
  sendLabel?: string;
  requireTelegram?: boolean;
  busy?: boolean;
  /** Кто выбран при открытии; null — все */
  initial?: string[] | null;
  /** Надпись на кнопке, когда выбраны все (по умолчанию «<sendLabel> всем») */
  allLabel?: string;
  onClose: () => void;
  onSend: (userIds: string[] | null) => void;
}) {
  if (!open) return null;
  return (
    <SendToDialogBody
      title={title}
      hint={hint}
      sendLabel={sendLabel}
      requireTelegram={requireTelegram}
      busy={busy}
      initial={initial}
      allLabel={allLabel ?? `${sendLabel} всем`}
      onClose={onClose}
      onSend={onSend}
    />
  );
}

// Тело окна — отдельным компонентом: при каждом открытии выбор начинается заново («все»)
function SendToDialogBody({
  title,
  hint,
  sendLabel,
  requireTelegram,
  busy,
  initial,
  allLabel,
  onClose,
  onSend,
}: {
  title: string;
  hint?: string;
  sendLabel: string;
  requireTelegram: boolean;
  busy: boolean;
  initial: string[] | null;
  allLabel: string;
  onClose: () => void;
  onSend: (userIds: string[] | null) => void;
}) {
  const { groups, students, loading } = useRecipients();
  const eligible = useMemo(
    () => students.filter((s) => !requireTelegram || s.hasTelegram).map((s) => s.id),
    [students, requireTelegram]
  );
  // null — пока ничего не трогали: значит «все»
  const [picked, setPicked] = useState<string[] | null>(initial);
  const value = picked ?? eligible;
  const everyone = value.length === eligible.length && eligible.every((id) => value.includes(id));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Окно выносим прямо в <body> (портал): если кнопка стоит внутри карточки с анимацией сдвига,
  // «fixed» считался бы от карточки и окно уезжало за край экрана
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-4 min-[560px]:items-center" role="presentation">
      <div className="confirm-backdrop absolute inset-0 bg-[rgba(15,26,25,0.45)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-to-title"
        className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-popover)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="send-to-title" className="font-display text-[17px] font-semibold text-[var(--text)]">
              {title}
            </h3>
            {hint && <p className="mt-1 text-sm text-[var(--text-2)]">{hint}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="press rounded-[var(--radius-sm)] p-1 text-[var(--text-3)] hover:bg-[var(--surface-muted)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-3)]">Загружаю учеников…</p>
        ) : (
          <RecipientPicker
            students={students}
            groups={groups}
            value={value}
            onChange={setPicked}
            requireTelegram={requireTelegram}
          />
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={busy || loading || value.length === 0}
            onClick={() => onSend(everyone ? null : value)}
          >
            {busy ? "Отправка…" : everyone ? allLabel : `${sendLabel} (${value.length})`}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
