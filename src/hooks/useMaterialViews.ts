"use client";

import { useCallback, useState } from "react";
import type { ViewedMap } from "@/lib/materials";

export function useMaterialViews(initial: ViewedMap) {
  const [views, setViews] = useState<ViewedMap>(initial);

  const markViewed = useCallback(async (materialId: string) => {
    const res = await fetch("/api/materials/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const viewedAt = data.view?.viewedAt
      ? new Date(data.view.viewedAt).toISOString()
      : new Date().toISOString();
    setViews((prev) => ({ ...prev, [materialId]: viewedAt }));
  }, []);

  const unmarkViewed = useCallback(async (materialId: string) => {
    const res = await fetch("/api/materials/view", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    if (!res.ok) return;
    setViews((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  }, []);

  return { views, markViewed, unmarkViewed };
}
