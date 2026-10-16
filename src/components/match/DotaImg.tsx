"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Картинка героя/предмета со Steam CDN; если не загрузилась — серая плашка с подписью */
export function DotaImg({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);

  if (!current || failed) {
    return (
      <span
        title={alt}
        className={cn(className, "flex items-center justify-center bg-[var(--control)] text-[9px] font-semibold text-[var(--text-3)]")}
      >
        {alt.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      title={alt}
      className={cn(className, "bg-[var(--control)]")}
      loading="lazy"
      decoding="async"
      style={{ imageRendering: "auto" }}
      onError={() => {
        // crops → обычный портрет
        if (current.includes("/heroes/crops/")) {
          setCurrent(current.replace("/heroes/crops/", "/heroes/"));
          return;
        }
        setFailed(true);
      }}
    />
  );
}
