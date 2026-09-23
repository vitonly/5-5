"use client";

import { videoThumbnail } from "@/lib/utils";
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

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface)] transition-transform ${
        viewed
          ? "border-[var(--border-soft)] opacity-55 grayscale"
          : "border-[var(--border)] hover:-translate-y-0.5"
      }`}
    >
      {isNew && !viewed && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-[var(--points)] px-2.5 py-0.5 font-mono-num text-[10px] font-bold uppercase tracking-wide text-white">
          Новое
        </span>
      )}
      {viewed && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-[var(--control)] px-2.5 py-0.5 font-mono-num text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)]">
          Просмотрено
        </span>
      )}
      <a href={url || "#"} target="_blank" rel="noopener noreferrer" className="group block">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={title} className="aspect-video w-full object-cover" />
        ) : (
          <div className="img-placeholder flex aspect-video w-full items-center justify-center font-mono-num text-[12px] text-[var(--text-4)]">
            обложка 16:9
          </div>
        )}
        <div className="p-3 pb-2">
          <span className="font-mono-num text-[10px] font-medium uppercase tracking-wider text-[var(--text-4)]">
            Видео
          </span>
          <p
            className={`mt-1 line-clamp-2 text-sm font-semibold ${
              viewed ? "text-[var(--text-3)]" : "text-[var(--text)] group-hover:text-[var(--points)]"
            }`}
          >
            {title || "Без названия"}
          </p>
          {skillLevels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skillLevels.map((level) => (
                <span
                  key={level}
                  className="rounded border border-[var(--border)] bg-[var(--control)] px-2 py-0.5 text-[10px] text-[var(--text-2)]"
                >
                  {SKILL_LEVEL_LABELS[level]}
                </span>
              ))}
            </div>
          )}
          {description && (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-3)]">{description}</p>
          )}
        </div>
      </a>
      {(onMarkViewed || onUnmarkViewed) && (
        <div className="border-t border-[var(--border-soft)] px-3 py-2">
          {viewed ? (
            <button
              type="button"
              onClick={onUnmarkViewed}
              className="text-xs font-medium text-[var(--text-3)] hover:text-[var(--points)]"
            >
              Вернуть в ленту
            </button>
          ) : (
            <button
              type="button"
              onClick={onMarkViewed}
              className="text-xs font-medium text-[var(--points)] hover:underline"
            >
              Просмотрено
            </button>
          )}
        </div>
      )}
    </div>
  );
}
