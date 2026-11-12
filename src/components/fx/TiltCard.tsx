"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isTouchOnly, subscribeTilt } from "@/components/fx/motion";

/**
 * 3D-наклон + голографический блик.
 * Мышь: карточка следит за курсором. Телефон: наклон по гироскопу
 * (относительно того, как держат телефон; «ноль» плавно подстраивается).
 * Слои внутри карточки (класс .tilt-layer) сдвигаются на разную глубину — получается объём.
 * Если передан back — по нажатию карточка переворачивается и показывает оборот.
 * При prefers-reduced-motion — обычная карточка без движения.
 */
export function TiltCard({
  children,
  className,
  max = 8,
  shape,
  back,
  flipLabel = "Перевернуть карточку",
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  /** clip-path для блика (повторяет форму карточки), в процентах */
  shape?: string;
  /** Оборот карточки: если есть, по нажатию карточка переворачивается */
  back?: React.ReactNode;
  /** Подпись для экранного диктора */
  flipLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [flipped, setFlipped] = useState(false);

  const canTilt = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** rx, ry — углы наклона; gx, gy — где блик (в %); tx, ty — наклон от −1 до 1 для слоёв глубины */
  const apply = (rx: number, ry: number, gx: number, gy: number, tx: number, ty: number) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${rx}deg`);
      el.style.setProperty("--ry", `${ry}deg`);
      el.style.setProperty("--gx", `${gx}%`);
      el.style.setProperty("--gy", `${gy}%`);
      // По этим числам слои внутри карточки сдвигаются на свою глубину
      el.style.setProperty("--tx", `${tx}`);
      el.style.setProperty("--ty", `${ty}`);
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
      apply(rx, ry, 50 + (ry / max) * 40, 50 - (rx / max) * 40, ry / max, -rx / max);
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
    apply((0.5 - y) * max * 2, (x - 0.5) * max * 2, x * 100, y * 100, x * 2 - 1, y * 2 - 1);
  }

  function onLeave() {
    const el = ref.current;
    if (!el || el.dataset.gyro === "true") return;
    cancelAnimationFrame(frame.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--tx", "0");
    el.style.setProperty("--ty", "0");
    el.dataset.active = "false";
  }

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFlipped((f) => !f);
    }
  }

  const glare = <span className="tilt-glare" style={shape ? { clipPath: shape } : undefined} aria-hidden />;

  return (
    <div className={cn("tilt-scene", className)}>
      <div ref={ref} className="tilt-card" onPointerMove={onMove} onPointerLeave={onLeave}>
        {back ? (
          // Две стороны в одном «листе»: лицо и оборот, оборот заранее развёрнут на 180°
          <div
            className="flip-inner"
            data-flipped={flipped}
            role="button"
            tabIndex={0}
            aria-pressed={flipped}
            aria-label={flipLabel}
            onClick={() => setFlipped((f) => !f)}
            onKeyDown={onKey}
          >
            <div className="flip-face" aria-hidden={flipped}>
              {children}
              {glare}
            </div>
            <div className="flip-face flip-back" aria-hidden={!flipped}>
              {back}
              {glare}
            </div>
          </div>
        ) : (
          <>
            {children}
            {glare}
          </>
        )}
      </div>
    </div>
  );
}
