"use client";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Скопировать сводку попытки (задание, время, ссылки на файлы) — чтобы отправить на проверку */
export function CopyForReview({ text }: { text: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Скопировано");
        } catch {
          toast.error("Не получилось скопировать");
        }
      }}
    >
      Скопировать для проверки
    </Button>
  );
}
