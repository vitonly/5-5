"use client";

import { useEffect, useState } from "react";

/**
 * Кнопки «Голос» и «Чат» в шапке (телефон и компьютер).
 * Раньше это были плавающие круглые кнопки в правом нижнем углу, и они закрывали карточки.
 * Сами панели живут в VoiceDock / ChatPanel; связь — через события window:
 *   startplus:voice-toggle / startplus:chat-toggle   — открыть/закрыть панель
 *   startplus:voice-state {inRoom} / startplus:chat-unread {count} — состояние для значков
 *   startplus:quick-sync — попросить панели прислать текущее состояние (шапка могла смонтироваться позже)
 */
export const QUICK_EVENTS = {
  voiceToggle: "startplus:voice-toggle",
  chatToggle: "startplus:chat-toggle",
  voiceState: "startplus:voice-state",
  chatUnread: "startplus:chat-unread",
  sync: "startplus:quick-sync",
} as const;

export function HeaderQuickActions() {
  const [unread, setUnread] = useState(0);
  const [inRoom, setInRoom] = useState(false);

  useEffect(() => {
    const onUnread = (e: Event) => setUnread(Number((e as CustomEvent).detail?.count) || 0);
    const onVoice = (e: Event) => setInRoom(Boolean((e as CustomEvent).detail?.inRoom));
    window.addEventListener(QUICK_EVENTS.chatUnread, onUnread);
    window.addEventListener(QUICK_EVENTS.voiceState, onVoice);
    window.dispatchEvent(new Event(QUICK_EVENTS.sync));
    return () => {
      window.removeEventListener(QUICK_EVENTS.chatUnread, onUnread);
      window.removeEventListener(QUICK_EVENTS.voiceState, onVoice);
    };
  }, []);

  const btn =
    "press relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[17px] transition-colors hover:border-[var(--border-field)]";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={btn}
        aria-label={inRoom ? "Голосовые комнаты — вы в комнате" : "Голосовые комнаты"}
        onClick={() => window.dispatchEvent(new Event(QUICK_EVENTS.voiceToggle))}
      >
        {inRoom ? "🎧" : "🎙"}
        {inRoom && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)] ring-2 ring-[var(--surface)]" />}
      </button>
      <button
        type="button"
        className={btn}
        aria-label={unread ? `Чат, непрочитанных: ${unread}` : "Чат"}
        onClick={() => window.dispatchEvent(new Event(QUICK_EVENTS.chatToggle))}
      >
        💬
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-[10px] font-bold leading-none text-white ring-2 ring-[var(--surface)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
