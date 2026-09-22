"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function OverdueCheckButton() {
  const router = useRouter();

  async function check() {
    await fetch("/api/admin/overdue", { method: "POST" });
    router.refresh();
  }

  return (
    <Button onClick={check} variant="secondary">
      Проверить просроченные домашки
    </Button>
  );
}
