"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Число «докручивается» от 0 до значения, когда впервые попадает в экран.
 * ease-out, ~700 мс; при prefers-reduced-motion сразу показывает итог.
 */
export function CountUp({
  value,
  decimals = "auto",
  duration = 700,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number | "auto";
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  const format = (n: number) => {
    if (decimals === "auto") {
      const r = Math.round(n * 10) / 10;
      return Number.isInteger(value) ? String(Math.round(n)) : r.toFixed(1);
    }
    return n.toFixed(decimals);
  };

  useIsoLayoutEffect(() => {
    // Уже анимировали — просто синхронизируем (иначе при смене value остаётся старое число)
    if (started.current) {
      setShown(value);
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      setShown(value);
      return;
    }
    setShown(0);

    let raf = 0;
    const target = value;
    const run = () => {
      started.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(target * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(shown)}
      {suffix}
    </span>
  );
}
