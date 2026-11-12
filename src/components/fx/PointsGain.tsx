"use client";

import { useEffect, useState } from "react";
import { CountUp } from "@/components/fx/CountUp";
import { Burst } from "@/components/fx/Burst";

/** Очки как на сайте: целое — без дробной части, иначе одна цифра после точки */
function fmt(n: number) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Очки, которые «набегают» с прошлого раза.
 * Запоминаем в браузере, сколько очков ученик видел в прошлый заход. Если стало больше —
 * цифра докручивается со старого числа до нового, вылетает салют и плашка «+N».
 * Первый заход или очков стало меньше (новый сезон) — просто запоминаем, без салюта.
 */
export function PointsGain({
  value,
  storageKey,
  className,
}: {
  value: number;
  /** Ключ в localStorage — свой для каждого ученика */
  storageKey: string;
  className?: string;
}) {
  // from — откуда докручивать (null — ещё не прочитали прошлое значение), gain — сколько прибавилось
  const [from, setFrom] = useState<number | null>(null);
  const [gain, setGain] = useState(0);

  useEffect(() => {
    // Читаем в следующем кадре: на сервере хранилища браузера нет, поэтому первый кадр — как у всех
    const raf = requestAnimationFrame(() => {
      let prev: number | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw != null && Number.isFinite(Number(raw))) prev = Number(raw);
        localStorage.setItem(storageKey, String(value));
      } catch {
        // Браузер не даёт хранить данные (приватный режим) — просто без салюта
      }
      if (prev != null && prev < value) {
        setFrom(prev);
        setGain(value - prev);
      } else {
        // Прибавки нет — обычная докрутка с нуля, как у всех чисел на сайте
        setFrom(0);
        setGain(0);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [storageKey, value]);

  return (
    <span className="relative inline-flex">
      {/* key: когда узнали прошлое значение — счётчик запускается заново уже от него */}
      <CountUp key={from ?? "first"} value={value} from={from ?? 0} className={className} />
      {gain > 0 && (
        <>
          <Burst />
          <span className="gain-badge">+{fmt(gain)}</span>
          <span className="sr-only" aria-live="polite">
            Начислено {fmt(gain)} очк.
          </span>
        </>
      )}
    </span>
  );
}
