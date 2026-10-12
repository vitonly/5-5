import { ExternalLink, Eye } from "lucide-react";
import { PositionBadge } from "@/components/RoleIcon";
import { DOTA_ROLE_POSITION } from "@/lib/labels";
import { materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type { LiveStream } from "@/lib/twitch";
import type { DotaRole } from "@prisma/client";

type StreamMaterial = {
  id: string;
  title: string;
  description?: string;
  url?: string | null;
  positions: string;
  type?: string;
};

function streamUrl(material: StreamMaterial, login: string) {
  return material.url?.startsWith("http") ? material.url : `https://twitch.tv/${login}`;
}

function Roles({ positions }: { positions: string }) {
  const roles = parseJsonArray(positions) as DotaRole[];
  if (roles.length === 0) return null;
  return (
    <span className="flex shrink-0 gap-1">
      {roles.map((r) => (
        <PositionBadge key={r} position={DOTA_ROLE_POSITION[r]} className="h-[18px] w-[18px] text-[10px]" />
      ))}
    </span>
  );
}

/** Карточка эфира в стиле Twitch: превью, бейдж LIVE и зрители */
export function StreamCard({
  material,
  login,
  live,
}: {
  material: StreamMaterial;
  login: string;
  live?: LiveStream | null;
}) {
  const url = streamUrl(material, login);
  const thumbnail =
    live?.thumbnailUrl || `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-440x248.jpg`;
  const isLive = !!live;
  const title = isLive && live.title ? live.title : materialDisplayTitle({ ...material, type: material.type ?? "STREAM" });

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover-lift group block overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]"
    >
      <div className="relative bg-[var(--control)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        {isLive ? (
          <>
            <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-[5px] bg-[var(--danger)] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />В эфире
            </span>
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-[5px] bg-black/70 px-1.5 py-0.5 font-mono-num text-[12px] text-white">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {live.viewers}
            </span>
          </>
        ) : (
          <span className="absolute left-2 top-2 rounded-[5px] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-2)]">
            Офлайн
          </span>
        )}
      </div>
      <div className="flex items-start gap-3 p-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--points-bg)] font-display text-[13px] font-bold uppercase text-[var(--points-ink)] ${
            isLive ? "ring-2 ring-[var(--danger)] ring-offset-2 ring-offset-[var(--surface)]" : ""
          }`}
        >
          {login.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--text)] group-hover:text-[var(--points-ink)]">{title}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="truncate font-mono-num text-[12px] text-[var(--text-3)]">{login}</p>
            <Roles positions={material.positions} />
          </div>
        </div>
      </div>
    </a>
  );
}

/** Компактная строка офлайн-канала — список, как «Каналы» на Twitch */
export function OfflineStreamRow({ material, login }: { material: StreamMaterial; login: string }) {
  const title = materialDisplayTitle({ ...material, type: material.type ?? "STREAM" });
  return (
    <a
      href={streamUrl(material, login)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--control)] font-display text-[13px] font-bold uppercase text-[var(--text-3)]">
        {login.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-[var(--text)] group-hover:text-[var(--points-ink)]">{title}</p>
        <p className="truncate text-[12px] text-[var(--text-3)]">
          <span className="font-mono-num">{login}</span>
          {material.description ? ` · ${material.description}` : ""}
        </p>
      </div>
      <Roles positions={material.positions} />
      <ExternalLink className="h-4 w-4 shrink-0 text-[var(--text-3)]" aria-hidden />
    </a>
  );
}
