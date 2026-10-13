"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function TelegramConnect({
  linked,
  botUsername,
  linkToken,
}: {
  linked: boolean;
  botUsername: string;
  linkToken: string;
}) {
  if (linked) {
    return (
      <p className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-sm leading-none text-[var(--success)]">
        <span aria-hidden>✅</span>
        Telegram подключён — уведомления включены
      </p>
    );
  }

  const link = `https://t.me/${botUsername}?start=link_${linkToken}`;

  return (
    <Card className="border-[var(--points-border)] bg-[var(--points-bg)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[var(--points)]">
          Привяжите Telegram для уведомлений
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--text-2)]">
          Telegram нужен для уведомлений о домашках, сообщениях от тренера и напоминаний. На вход на
          сайт это не влияет.
        </p>
        <Button asChild>
          <a href={link} target="_blank" rel="noopener noreferrer">
            Привязать Telegram
          </a>
        </Button>
        <p className="text-xs text-[var(--text-3)]">
          Откроется бот @{botUsername}. Нажмите «Start» / «Запустить».
        </p>
      </CardContent>
    </Card>
  );
}
