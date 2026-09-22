import { videoThumbnail } from "@/lib/utils";
import { SKILL_LEVEL_LABELS } from "@/lib/labels";
import type { SkillLevel } from "@prisma/client";

export function VideoCard({
  title,
  url,
  description,
  isNew,
  skillLevels = [],
}: {
  title: string;
  url?: string | null;
  description?: string;
  isNew?: boolean;
  skillLevels?: SkillLevel[];
}) {
  const thumb = videoThumbnail(url);

  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] transition-transform hover:-translate-y-0.5"
    >
      {isNew && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-[var(--points)] px-2.5 py-0.5 font-mono-num text-[10px] font-bold uppercase tracking-wide text-white">
          Новое
        </span>
      )}
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={title} className="aspect-video w-full object-cover" />
      ) : (
        <div className="img-placeholder flex aspect-video w-full items-center justify-center font-mono-num text-[12px] text-[var(--text-4)]">
          обложка 16:9
        </div>
      )}
      <div className="p-3">
        <span className="font-mono-num text-[10px] font-medium uppercase tracking-wider text-[var(--text-4)]">
          Видео
        </span>
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--text)] group-hover:text-[var(--points)]">
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
  );
}
