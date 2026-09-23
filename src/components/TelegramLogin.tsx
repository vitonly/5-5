"use client";

import { useEffect, useRef } from "react";

interface TelegramLoginProps {
  botUsername: string;
  /** Абсолютный URL callback для redirect-flow */
  authUrl: string;
}

function normalizeBot(raw: string) {
  return raw.trim().replace(/^@/, "");
}

/**
 * Официальный Login Widget с data-auth-url (redirect).
 * Надёжнее, чем data-onauth callback в попапе.
 */
export function TelegramLogin({ botUsername, authUrl }: TelegramLoginProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bot = normalizeBot(botUsername);

  useEffect(() => {
    if (!bot || !authUrl) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-auth-url", authUrl);
    script.setAttribute("data-request-access", "write");

    const container = containerRef.current;
    if (container) {
      container.innerHTML = "";
      container.appendChild(script);
    }
  }, [bot, authUrl]);

  if (!bot) {
    return (
      <p className="text-center text-sm text-[var(--danger)]">
        Не задан NEXT_PUBLIC_BOT_USERNAME
      </p>
    );
  }

  return <div ref={containerRef} className="flex justify-center" />;
}
