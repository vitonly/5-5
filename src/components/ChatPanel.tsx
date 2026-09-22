"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/utils";

interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === "ADMIN";
  const conversationActive = isAdmin ? peerId !== null : true;

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

  async function send() {
    if (!draft.trim()) return;
    const recipientId = isAdmin ? peerId : undefined;
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId, body: draft }),
    });
    if (res.ok) {
      setDraft("");
      loadMessages();
      loadContacts();
    }
  }

  function openConversation(id: string, name: string) {
    setPeerId(id);
    setPeerName(name);
    setMessages([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--points)] text-2xl text-white shadow-lg hover:bg-[var(--points-hover)] min-[720px]:bottom-6 min-[720px]:right-6"
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
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
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
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? "bg-[var(--points)] text-white"
                            : "bg-[var(--control)] text-[var(--text)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className="mt-1 font-mono-num text-[10px] opacity-60">
                          {formatDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex gap-2 border-t border-[var(--border)] p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Написать сообщение..."
                rows={1}
                className="flex-1 resize-none rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-4)] focus:border-[var(--points)] focus:outline-none"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim()}
                className="rounded-[var(--radius-control)] bg-[var(--points)] px-4 text-sm font-medium text-white hover:bg-[var(--points-hover)] disabled:opacity-50"
              >
                →
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
