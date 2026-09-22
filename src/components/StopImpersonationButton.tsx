"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StopImpersonationButton() {
  const router = useRouter();

  async function stop() {
    await fetch("/api/auth/impersonate", { method: "DELETE" });
    router.push("/admin/students");
    router.refresh();
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={stop}>
      Вернуться к админу
    </Button>
  );
}
