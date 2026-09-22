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
      <Card className="border-[var(--success-border)] bg-[var(--success-bg)]">
        <CardContent className="py-4">
          <p className="text-sm text-[var(--success)]">✅ Telegram подключён — уведомления включены</p>
        </CardContent>
      </Card>
    );
  }

  const link = `https://t.me/${botUsername}?start=link_${linkToken}`;

  return (
    <Card className="border-[var(--points-border)] bg-[var(--points-bg)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[var(--points)]">Подключите Telegram</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--text-2)]">
          Чтобы получать уведомления о домашках, сообщениях от тренера и напоминания — привяжите Telegram.
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
