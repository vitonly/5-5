"use client";

import { toast } from "@/components/ui/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/utils";
import { usePasteImage } from "@/lib/use-paste-image";
import { uploadAppFile } from "@/lib/upload-client";
import { QUICK_EVENTS } from "@/components/HeaderQuickActions";

interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
  photoUrl: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
}

export function ChatPanel({ role, myId }: { role: "ADMIN" | "STUDENT"; myId: string }) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peerName, setPeerName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = role === "ADMIN";
  const conversationActive = isAdmin ? peerId !== null : true;

  // Связь с кнопкой в шапке на телефоне (см. HeaderQuickActions)
  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    const sync = () => window.dispatchEvent(new CustomEvent(QUICK_EVENTS.chatUnread, { detail: { count: totalUnread } }));
    window.addEventListener(QUICK_EVENTS.chatToggle, toggle);
    window.addEventListener(QUICK_EVENTS.sync, sync);
    sync();
    return () => {
      window.removeEventListener(QUICK_EVENTS.chatToggle, toggle);
      window.removeEventListener(QUICK_EVENTS.sync, sync);
    };
  }, [totalUnread]);

  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/messages/contacts");
    if (res.ok) {
      const data = await res.json();
      setContacts(data.contacts || []);
      setTotalUnread(data.totalUnread || 0);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (isAdmin && !peerId) return;
    const url = isAdmin ? `/api/messages?peerId=${peerId}` : "/api/messages";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
      if (data.peer) setPeerName(data.peer.name);
    }
  }, [isAdmin, peerId]);

  useEffect(() => {
    loadContacts();
    const interval = setInterval(loadContacts, 8000);
    return () => clearInterval(interval);
  }, [loadContacts]);

  useEffect(() => {
    if (!open || !conversationActive) return;
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [open, conversationActive, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const onPasteUploaded = useCallback(async (url: string) => {
    setPendingImage(url);
  }, []);

  const { onPaste, uploading: pasteUploading } = usePasteImage({
    onUploaded: onPasteUploaded,
    enabled: open && conversationActive && !sending,
  });

  async function attachFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setSending(true);
    try {
      const { url } = await uploadAppFile(file);
      setPendingImage(url);
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  }

  async function send() {
    if ((!draft.trim() && !pendingImage) || sending) return;
    const recipientId = isAdmin ? peerId : undefined;
    const body = draft;
    const imageUrl = pendingImage;
    // Сразу очищаем — иначе при долгом TG-уведомлении поля «залипают»
    setDraft("");
    setPendingImage(null);
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId,
          body,
          imageUrl,
        }),
      });
      if (!res.ok) {
        setDraft(body);
        setPendingImage(imageUrl);
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Не удалось отправить");
        return;
      }
      void loadMessages();
      void loadContacts();
    } catch {
      setDraft(body);
      setPendingImage(imageUrl);
      toast.error("Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  function openConversation(id: string, name: string) {
    setPeerId(id);
    setPeerName(name);
    setMessages([]);
    setPendingImage(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 touch-manipulation select-none items-center justify-center rounded-full bg-[var(--points)] text-2xl text-white shadow-[var(--shadow-popover)] transition-[background-color,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[var(--points-hover)] active:scale-[0.97] min-[720px]:flex"
        aria-label="Чат"
      >
        💬
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-xs font-bold text-white">
            {totalUnread}
          </span>
        )}
      </button>

      <aside
        // Закрытая панель полностью скрыта: без тени у края экрана и без фокуса клавиатурой
        inert={!open}
        aria-hidden={!open}
        className={`drawer-panel fixed right-0 top-0 z-[60] flex h-full w-full max-w-sm flex-col border-l border-[var(--border)] bg-[var(--surface)] ${
          open ? "is-open translate-x-0 shadow-[var(--shadow-popover)]" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <div className="flex items-center gap-2">
            {isAdmin && peerId && (
              <button
                type="button"
                onClick={() => setPeerId(null)}
                className="rounded px-2 py-1 text-sm text-[var(--text-2)] hover:bg-[var(--control)]"
              >
                ←
              </button>
            )}
            <h3 className="font-display font-bold text-[var(--text)]">
              {isAdmin ? (peerId ? peerName : "Сообщения") : `Чат с тренером`}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded px-2 py-1 text-[var(--text-2)] hover:bg-[var(--control)]"
          >
            ✕
          </button>
        </div>

        {isAdmin && !peerId ? (
          <div className="flex-1 overflow-y-auto">
            {contacts.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-2)]">Учеников пока нет</p>
            ) : (
              contacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id, c.name)}
                  className="flex w-full items-center gap-3 border-b border-[var(--border-soft)] p-3 text-left hover:bg-[var(--control)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--control)] text-sm">
                    {c.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      c.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text)]">{c.name}</p>
                    <p className="truncate text-xs text-[var(--text-3)]">
                      {c.lastMessage || "Нет сообщений"}
                    </p>
                  </div>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-xs font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-[var(--text-3)]">Сообщений пока нет</p>
              ) : (
                messages.map((m) => {
                  const mine = m.senderId === myId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-[var(--radius-card)] px-3 py-2 text-sm ${
                          mine
                            ? "bg-[var(--points)] text-white"
                            : "bg-[var(--control)] text-[var(--text)]"
                        }`}
                      >
                        {m.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={m.imageUrl}
                              alt=""
                              className="mb-2 max-h-48 w-full rounded-[var(--radius-control)] object-cover"
                            />
                          </a>
                        )}
                        {m.body && m.body !== "📷 Фото" && (
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        )}
                        <p className="mt-1 font-mono-num text-[11px] opacity-60">
                          {formatDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="space-y-2 border-t border-[var(--border)] p-3" onPaste={onPaste}>
              {pendingImage && (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImage}
                    alt=""
                    className="h-20 rounded-[var(--radius-control)] border border-[var(--border)] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPendingImage(null)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--danger)] text-xs text-white"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void attachFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={sending || pasteUploading}
                  className="rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-sm text-[var(--text-2)] hover:bg-[var(--control)] disabled:opacity-50"
                  title="Прикрепить фото"
                >
                  📎
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onPaste={onPaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={
                    pasteUploading ? "Загрузка фото…" : "Сообщение или Ctrl+V фото…"
                  }
                  rows={1}
                  className="flex-1 resize-none rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-4)] focus:border-[var(--points)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || pasteUploading || (!draft.trim() && !pendingImage)}
                  className="rounded-[var(--radius-control)] bg-[var(--points)] px-4 text-sm font-medium text-white hover:bg-[var(--points-hover)] disabled:opacity-50"
                >
                  →
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
