"use client";

import { useEffect, useRef } from "react";

interface TelegramLoginProps {
  botUsername: string;
  onAuth: (user: Record<string, string | number>) => void;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

export function TelegramLogin({ botUsername, onAuth }: TelegramLoginProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.onTelegramAuth = onAuth;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");

    const container = containerRef.current;
    if (container) {
      container.innerHTML = "";
      container.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
    };
  }, [botUsername, onAuth]);

  return <div ref={containerRef} className="flex justify-center" />;
}
