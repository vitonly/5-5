"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function OverdueCheckButton() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/overdue", { method: "POST" });
      if (res.ok) toast.success("Просрочки проверены");
      else toast.error("Не удалось проверить просрочки");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={check} variant="secondary" size="sm" disabled={busy}>
      {busy ? "Проверяю…" : "Проверить просрочки сейчас"}
    </Button>
  );
}
