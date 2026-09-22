"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { DOTA_ROLE_LABELS, SKILL_LEVEL_LABELS } from "@/lib/labels";
import { groupVideosByPosition, isNewMaterial, parseSkillLevels } from "@/lib/materials";
import { materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type { DotaRole, LearningMaterial, SkillLevel } from "@prisma/client";

const ROLES = Object.keys(DOTA_ROLE_LABELS) as DotaRole[];
const LEVELS = Object.keys(SKILL_LEVEL_LABELS) as SkillLevel[];

const GROUP_TITLES: Record<string, string> = {
  GENERAL: "Общие видео",
  ...DOTA_ROLE_LABELS,
};

const chipActive =
  "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points)]";
const chipInactive =
  "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]";

export function VideosClient({ videos }: { videos: LearningMaterial[] }) {
  const [roleFilter, setRoleFilter] = useState<DotaRole | null>(null);
  const [levelFilter, setLevelFilter] = useState<SkillLevel | null>(null);

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      const positions = parseJsonArray(v.positions) as DotaRole[];
      const levels = parseSkillLevels(v.skillLevels);
      if (roleFilter && positions.length > 0 && !positions.includes(roleFilter)) return false;
      if (levelFilter && levels.length > 0 && !levels.includes(levelFilter)) return false;
      return true;
    });
  }, [videos, roleFilter, levelFilter]);

  const groups = useMemo(() => groupVideosByPosition(filtered), [filtered]);

  const orderedGroupKeys = [
    ...ROLES.filter((r) => groups.has(r)),
    ...(groups.has("GENERAL") ? (["GENERAL"] as const) : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/materials" className="text-sm text-[var(--points)] hover:underline">
          ← Все материалы
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLevelFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !levelFilter ? chipActive : chipInactive
            }`}
          >
            Все уровни
          </button>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevelFilter(l)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                levelFilter === l ? chipActive : chipInactive
              }`}
            >
              {SKILL_LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[var(--text-3)]">Видео не найдены.</p>
      ) : (
        orderedGroupKeys.map((key) => {
          const items = groups.get(key) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={key}>
              <h2 className="mb-4 text-xl font-bold text-[var(--text)]">{GROUP_TITLES[key]}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((v) => (
                  <VideoCard
                    key={v.id}
                    title={materialDisplayTitle(v)}
                    url={v.url}
                    description={v.description || undefined}
                    isNew={isNewMaterial(v.createdAt)}
                    skillLevels={parseSkillLevels(v.skillLevels)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
