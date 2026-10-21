"use client";

import { useEffect, useState } from "react";

/**
 * Кнопка «Голос» в шапке (телефон и компьютер).
 * Раньше это была плавающая круглая кнопка в правом нижнем углу, и она закрывала карточки.
 * Сама панель живёт в VoiceDock; связь — через события window:
 *   startplus:voice-toggle         — открыть/закрыть панель
 *   startplus:voice-state {inRoom} — состояние для значка
 *   startplus:quick-sync           — попросить панель прислать текущее состояние (шапка могла смонтироваться позже)
 */
export const QUICK_EVENTS = {
  voiceToggle: "startplus:voice-toggle",
  voiceState: "startplus:voice-state",
  sync: "startplus:quick-sync",
} as const;

export function HeaderQuickActions() {
  const [inRoom, setInRoom] = useState(false);

  useEffect(() => {
    const onVoice = (e: Event) => setInRoom(Boolean((e as CustomEvent).detail?.inRoom));
    window.addEventListener(QUICK_EVENTS.voiceState, onVoice);
    window.dispatchEvent(new Event(QUICK_EVENTS.sync));
    return () => window.removeEventListener(QUICK_EVENTS.voiceState, onVoice);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="press relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[17px] transition-colors hover:border-[var(--border-field)]"
        aria-label={inRoom ? "Голосовые комнаты — вы в комнате" : "Голосовые комнаты"}
        onClick={() => window.dispatchEvent(new Event(QUICK_EVENTS.voiceToggle))}
      >
        {inRoom ? "🎧" : "🎙"}
        {inRoom && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)] ring-2 ring-[var(--surface)]" />}
      </button>
    </div>
  );
}
