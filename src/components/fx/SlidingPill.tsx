"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Плашка, которая плавно «переезжает» под выбранную вкладку.
 * Кладётся внутрь дорожки с вкладками (у дорожки класс .pill-track); выбранная вкладка — с aria-selected="true".
 * Пока плашка не измерила вкладки (первый кадр, без JS), у выбранной вкладки остаётся свой фон — ничего не мигает.
 */
export function SlidingPill({
  activeKey,
}: {
  /** Что сейчас выбрано — при смене плашка едет к новой вкладке */
  activeKey: string;
}) {
  const pill = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    // Дорожка — родитель плашки. Берём её так, а не через ref родителя:
    // при первом показе ref родителя ещё пустой, когда срабатывает этот эффект
    const el = pill.current;
    const track = el?.parentElement;
    if (!el || !track) return;

    const place = () => {
      const active = track.querySelector<HTMLElement>(':scope > [aria-selected="true"]');
      if (!active) {
        el.style.opacity = "0";
        return;
      }
      el.style.width = `${active.offsetWidth}px`;
      el.style.height = `${active.offsetHeight}px`;
      el.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      el.style.opacity = "1";
    };

    place();
    // Анимацию включаем со следующего кадра — чтобы при загрузке плашка не «прилетала» из угла
    const raf = requestAnimationFrame(() => {
      track.dataset.pill = "ready";
    });
    // Ширина вкладок меняется (поворот телефона, шрифт загрузился) — переставляем плашку
    const ro = new ResizeObserver(place);
    ro.observe(track);
    for (const child of Array.from(track.children)) ro.observe(child);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [activeKey]);

  return <span ref={pill} className="pill-indicator" aria-hidden />;
}
