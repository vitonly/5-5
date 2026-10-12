"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { isTouchOnly, subscribeTilt } from "@/components/fx/motion";

/**
 * 3D-наклон + голографический блик.
 * Мышь: карточка следит за курсором. Телефон: наклон по гироскопу
 * (относительно того, как держат телефон; «ноль» плавно подстраивается).
 * При prefers-reduced-motion — обычная карточка.
 */
export function TiltCard({
  children,
  className,
  max = 8,
  shape,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  /** clip-path для блика (повторяет форму карточки), в процентах */
  shape?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const canTilt = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const apply = (rx: number, ry: number, gx: number, gy: number) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${rx}deg`);
      el.style.setProperty("--ry", `${ry}deg`);
      el.style.setProperty("--gx", `${gx}%`);
      el.style.setProperty("--gy", `${gy}%`);
      el.dataset.active = "true";
    });
  };

  /* Гироскоп на телефоне — только пока карточка на экране */
  useEffect(() => {
    const el = ref.current;
    if (!el || !isTouchOnly()) return;

    let visible = false;
    let base: { beta: number; gamma: number } | null = null;
    const clamp = (v: number) => Math.max(-max, Math.min(max, v));

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (!visible) base = null;
    });
    io.observe(el);

    const unsub = subscribeTilt(({ beta, gamma }) => {
      if (!visible) return;
      if (!base) base = { beta, gamma };
      // «ноль» медленно догоняет текущее положение — держишь ровно, карточка выпрямляется
      base.beta += (beta - base.beta) * 0.03;
      base.gamma += (gamma - base.gamma) * 0.03;
      const rx = clamp(-(beta - base.beta) * 0.6);
      const ry = clamp((gamma - base.gamma) * 0.6);
      el.dataset.gyro = "true";
      apply(rx, ry, 50 + (ry / max) * 40, 50 - (rx / max) * 40);
    });

    return () => {
      io.disconnect();
      unsub();
      cancelAnimationFrame(frame.current);
    };
  }, [max]);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!canTilt()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    apply((0.5 - y) * max * 2, (x - 0.5) * max * 2, x * 100, y * 100);
  }

  function onLeave() {
    const el = ref.current;
    if (!el || el.dataset.gyro === "true") return;
    cancelAnimationFrame(frame.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.dataset.active = "false";
  }

  return (
    <div className={cn("tilt-scene", className)}>
      <div ref={ref} className="tilt-card" onPointerMove={onMove} onPointerLeave={onLeave}>
        {children}
        <span className="tilt-glare" style={shape ? { clipPath: shape } : undefined} aria-hidden />
      </div>
    </div>
  );
}
