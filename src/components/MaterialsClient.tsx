"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StreamCard } from "@/components/StreamCard";
import { VideoCard } from "@/components/VideoCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOTA_ROLE_LABELS, MATERIAL_TYPE_LABELS } from "@/lib/labels";
import { isNewMaterial, parseSkillLevels } from "@/lib/materials";
import { extractTwitchLogin } from "@/lib/twitch";
import { materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type { LearningMaterial, MaterialType, DotaRole } from "@prisma/client";
import type { LiveStream } from "@/lib/twitch";

const ROLES = Object.keys(DOTA_ROLE_LABELS) as DotaRole[];

type Filter = "ALL" | "STREAM" | "ARTICLE";

function materialMatchesRole(m: LearningMaterial, roleFilter: DotaRole | null) {
  if (!roleFilter) return true;
  const pos = parseJsonArray(m.positions) as DotaRole[];
  if (pos.length === 0) return true;
  return pos.includes(roleFilter);
}

const chipActive =
  "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points)]";
const chipInactive =
  "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]";

export function MaterialsClient({
  materials,
  liveLogins,
  liveStreams,
}: {
  materials: LearningMaterial[];
  liveLogins: string[];
  liveStreams: LiveStream[];
}) {
  const [typeFilter, setTypeFilter] = useState<Filter>("ALL");
  const [roleFilter, setRoleFilter] = useState<DotaRole | null>(null);

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (m.type === "VIDEO") return false;
      if (typeFilter !== "ALL" && m.type !== typeFilter) return false;
      return materialMatchesRole(m, roleFilter);
    });
  }, [materials, typeFilter, roleFilter]);

  const allVideos = useMemo(
    () => materials.filter((m) => m.type === "VIDEO" && materialMatchesRole(m, roleFilter)),
    [materials, roleFilter]
  );

  const recentVideos = useMemo(
    () =>
      [...allVideos]
        .filter((v) => isNewMaterial(v.createdAt))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allVideos]
  );

  const articles = filtered.filter((m) => m.type === "ARTICLE");

  const streamEntries = useMemo(() => {
    return filtered
      .filter((m) => m.type === "STREAM")
      .map((material) => ({
        material,
        login: extractTwitchLogin(material.url || material.title || ""),
      }))
      .filter((e): e is { material: LearningMaterial; login: string } => Boolean(e.login));
  }, [filtered]);

  const liveLoginSet = useMemo(() => new Set(liveLogins.map((l) => l.toLowerCase())), [liveLogins]);

  const liveByLogin = useMemo(() => {
    const map = new Map<string, LiveStream>();
    for (const s of liveStreams) map.set(s.login.toLowerCase(), s);
    return map;
  }, [liveStreams]);

  const liveStreamEntries = streamEntries.filter(({ login }) => liveLoginSet.has(login));
  const offlineStreamEntries = streamEntries.filter(({ login }) => !liveLoginSet.has(login));

  const showStreams = typeFilter === "ALL" || typeFilter === "STREAM";
  const showArticles = typeFilter === "ALL" || typeFilter === "ARTICLE";
  const showVideos = typeFilter === "ALL";

  const hasAnyContent =
    liveStreamEntries.length > 0 ||
    offlineStreamEntries.length > 0 ||
    recentVideos.length > 0 ||
    articles.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">
          {(["ALL", "STREAM", "ARTICLE"] as Filter[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === t ? chipActive : chipInactive
              }`}
            >
              {t === "ALL" ? "Все" : MATERIAL_TYPE_LABELS[t as MaterialType]}
            </button>
          ))}
          <Link
            href="/materials/videos"
            className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors ${chipInactive}`}
          >
            {MATERIAL_TYPE_LABELS.VIDEO}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRoleFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !roleFilter ? chipActive : chipInactive
            }`}
          >
            Все позиции
          </button>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                roleFilter === r ? chipActive : chipInactive
              }`}
            >
              {DOTA_ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {showVideos && recentVideos.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[var(--text)]">Новые видео</h2>
            <Link href="/materials/videos" className="text-sm text-[var(--points)] hover:underline">
              Все видео →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentVideos.map((v) => (
              <VideoCard
                key={v.id}
                title={materialDisplayTitle(v)}
                url={v.url}
                description={v.description || undefined}
                isNew
                skillLevels={parseSkillLevels(v.skillLevels)}
              />
            ))}
          </div>
        </section>
      )}

      {showStreams && liveStreamEntries.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-[var(--text)]">🔴 Сейчас в эфире</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveStreamEntries.map(({ material, login }) => (
              <StreamCard
                key={material.id}
                material={material}
                login={login}
                live={liveByLogin.get(login)}
              />
            ))}
          </div>
        </section>
      )}

      {showArticles && articles.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-[var(--text)]">Статьи</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {articles.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle>{a.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{a.description}</p>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-[var(--radius-control)] bg-[var(--points)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--points-hover)]"
                    >
                      Читать
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {showStreams && offlineStreamEntries.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-[var(--text)]">Трансляции офлайн</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offlineStreamEntries.map(({ material, login }) => (
              <StreamCard key={material.id} material={material} login={login} />
            ))}
          </div>
        </section>
      )}

      {showStreams && streamEntries.length > 0 && liveStreamEntries.length === 0 && offlineStreamEntries.length === 0 && (
        <p className="text-sm text-[var(--text-3)]">Сейчас никто из выбранных каналов не в эфире.</p>
      )}

      {!hasAnyContent && (
        <p className="text-[var(--text-3)]">
          {roleFilter || typeFilter !== "ALL"
            ? "Нет материалов для выбранного фильтра."
            : "Материалы скоро появятся."}
        </p>
      )}
    </div>
  );
}
