"use client";

import { Check, Play, RotateCcw } from "lucide-react";
import { cn, videoThumbnail } from "@/lib/utils";
import { SKILL_LEVEL_LABELS } from "@/lib/labels";
import type { SkillLevel } from "@prisma/client";

export function VideoCard({
  title,
  url,
  description,
  isNew,
  skillLevels = [],
  viewed = false,
  onMarkViewed,
  onUnmarkViewed,
}: {
  title: string;
  url?: string | null;
  description?: string;
  isNew?: boolean;
  skillLevels?: SkillLevel[];
  viewed?: boolean;
  onMarkViewed?: () => void;
  onUnmarkViewed?: () => void;
}) {
  const thumb = videoThumbnail(url);
  const hasActions = Boolean(onMarkViewed || onUnmarkViewed);

  return (
    <div
      className={cn(
        "group/card relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface)] shadow-[var(--shadow-card)]",
        viewed ? "border-[var(--border-soft)]" : "hover-lift border-[var(--border)]"
      )}
    >
      <a href={url || "#"} target="_blank" rel="noopener noreferrer" className="group block flex-1">
        <div className={cn("relative overflow-hidden bg-[var(--control)]", viewed && "opacity-60 grayscale")}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" />
          ) : (
            <div className="img-placeholder aspect-video w-full" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/20">
            <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/90 text-[var(--text)] opacity-0 shadow-[var(--shadow-raised)] transition-[opacity,transform] duration-200 group-hover:scale-100 group-hover:opacity-100">
              <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
            </span>
          </span>
          {isNew && !viewed && (
            <span className="absolute left-2 top-2 rounded-full bg-[var(--points)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-[var(--shadow-xs)]">
              Новое
            </span>
          )}
          {viewed && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-2)] shadow-[var(--shadow-xs)]">
              <Check className="h-3 w-3" aria-hidden />
              Просмотрено
            </span>
          )}
        </div>
        <div className="px-3.5 pb-3 pt-3">
          <p
            className={cn(
              "line-clamp-2 text-[14px] font-semibold leading-snug",
              viewed ? "text-[var(--text-3)]" : "text-[var(--text)] group-hover:text-[var(--points-ink)]"
            )}
          >
            {title || "Без названия"}
          </p>
          {description && <p className="mt-1 line-clamp-2 text-[12px] text-[var(--text-3)]">{description}</p>}
          {skillLevels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skillLevels.map((level) => (
                <span
                  key={level}
                  className="rounded-full bg-[var(--control)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-2)]"
                >
                  {SKILL_LEVEL_LABELS[level]}
                </span>
              ))}
            </div>
          )}
        </div>
      </a>
      {hasActions && (
        <div className="flex border-t border-[var(--border-soft)]">
          {viewed ? (
            <button
              type="button"
              onClick={onUnmarkViewed}
              className="press flex h-10 flex-1 items-center justify-center gap-1.5 text-[13px] font-medium text-[var(--text-3)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Вернуть в ленту
            </button>
          ) : (
            <button
              type="button"
              onClick={onMarkViewed}
              className="press flex h-10 flex-1 items-center justify-center gap-1.5 text-[13px] font-medium text-[var(--points-ink)] transition-colors hover:bg-[var(--points-bg)]"
            >
              <Check className="h-4 w-4" aria-hidden />
              Отметить просмотренным
            </button>
          )}
        </div>
      )}
    </div>
  );
}
