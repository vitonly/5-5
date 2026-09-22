import { DOTA_ROLE_LABELS } from "@/lib/labels";
import { materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type { LiveStream } from "@/lib/twitch";
import type { DotaRole } from "@prisma/client";

type StreamMaterial = {
  id: string;
  title: string;
  description?: string;
  url?: string | null;
  positions: string;
};

export function StreamCard({
  material,
  login,
  live,
}: {
  material: StreamMaterial;
  login: string;
  live?: LiveStream | null;
}) {
  const url =
    material.url?.startsWith("http") ? material.url : `https://twitch.tv/${login}`;
  const thumbnail =
    live?.thumbnailUrl ||
    `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-440x248.jpg`;
  const isLive = !!live;
  const roles = parseJsonArray(material.positions) as DotaRole[];

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] transition-transform hover:-translate-y-0.5"
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail} alt={material.title} className="aspect-video w-full object-cover" />
        {isLive ? (
          <>
            <span className="absolute left-2 top-2 rounded bg-[var(--danger)] px-2 py-0.5 font-mono-num text-xs font-bold text-white">
              В ЭФИРЕ
            </span>
            <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 font-mono-num text-xs text-white">
              {live.viewers} зрителей
            </span>
          </>
        ) : (
          <span className="absolute left-2 top-2 rounded border border-[var(--border)] bg-[var(--control)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]">
            Офлайн
          </span>
        )}
      </div>
      <div className="p-3">
        <span className="font-mono-num text-[10px] font-medium uppercase tracking-wider text-[var(--text-4)]">
          Эфир
        </span>
        <p className="mt-1 truncate text-sm font-semibold text-[var(--text)] group-hover:text-[var(--points)]">
          {isLive && live.title ? live.title : materialDisplayTitle(material)}
        </p>
        <p className="font-mono-num text-xs text-[var(--text-3)]">{login}</p>
        {material.description && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-3)]">{material.description}</p>
        )}
        {roles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {roles.map((r) => (
              <span
                key={r}
                className="rounded border border-[var(--border)] bg-[var(--control)] px-2 py-0.5 text-[10px] text-[var(--text-2)]"
              >
                {DOTA_ROLE_LABELS[r]}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
