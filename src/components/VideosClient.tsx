"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { DOTA_ROLE_LABELS, SKILL_LEVEL_LABELS } from "@/lib/labels";
import {
  getViewedAt,
  groupVideosByPosition,
  isArchivedViewed,
  isNewMaterial,
  isSoftViewed,
  parseSkillLevels,
  type ViewedMap,
} from "@/lib/materials";
import { useMaterialViews } from "@/hooks/useMaterialViews";
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

type Tab = "active" | "viewed";

export function VideosClient({
  videos,
  initialViews = {},
}: {
  videos: LearningMaterial[];
  initialViews?: ViewedMap;
}) {
  const [roleFilter, setRoleFilter] = useState<DotaRole | null>(null);
  const [levelFilter, setLevelFilter] = useState<SkillLevel | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const { views, markViewed, unmarkViewed } = useMaterialViews(initialViews);

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      const positions = parseJsonArray(v.positions) as DotaRole[];
      const levels = parseSkillLevels(v.skillLevels);
      if (roleFilter && positions.length > 0 && !positions.includes(roleFilter)) return false;
      if (levelFilter && levels.length > 0 && !levels.includes(levelFilter)) return false;
      return true;
    });
  }, [videos, roleFilter, levelFilter]);

  const { activeVideos, viewedVideos } = useMemo(() => {
    const active: LearningMaterial[] = [];
    const viewedList: LearningMaterial[] = [];
    for (const v of filtered) {
      const at = getViewedAt(views, v.id);
      if (at) viewedList.push(v);
      if (!isArchivedViewed(at)) active.push(v);
    }
    active.sort((a, b) => {
      const aSoft = isSoftViewed(getViewedAt(views, a.id)) ? 1 : 0;
      const bSoft = isSoftViewed(getViewedAt(views, b.id)) ? 1 : 0;
      if (aSoft !== bSoft) return aSoft - bSoft;
      return 0;
    });
    viewedList.sort((a, b) => {
      const ta = getViewedAt(views, a.id)?.getTime() ?? 0;
      const tb = getViewedAt(views, b.id)?.getTime() ?? 0;
      return tb - ta;
    });
    return { activeVideos: active, viewedVideos: viewedList };
  }, [filtered, views]);

  const groups = useMemo(() => groupVideosByPosition(activeVideos), [activeVideos]);

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

      <div className="flex flex-wrap gap-2 border-b border-[var(--border-soft)] pb-3">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "active" ? chipActive : chipInactive
          }`}
        >
          Видео
        </button>
        <button
          type="button"
          onClick={() => setTab("viewed")}
          className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "viewed" ? chipActive : chipInactive
          }`}
        >
          Просмотренные материалы
          {viewedVideos.length > 0 && (
            <span className="ml-1.5 font-mono-num text-[var(--text-4)]">{viewedVideos.length}</span>
          )}
        </button>
      </div>

      {tab === "viewed" ? (
        viewedVideos.length === 0 ? (
          <p className="text-[var(--text-3)]">
            Отмеченные как просмотренные видео появятся здесь. Через неделю они остаются только в
            этой вкладке.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {viewedVideos.map((v) => (
              <VideoCard
                key={v.id}
                title={materialDisplayTitle(v)}
                url={v.url}
                description={v.description || undefined}
                skillLevels={parseSkillLevels(v.skillLevels)}
                viewed
                onUnmarkViewed={() => unmarkViewed(v.id)}
              />
            ))}
          </div>
        )
      ) : (
        <>
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

          {activeVideos.length === 0 ? (
            <p className="text-[var(--text-3)]">Видео не найдены.</p>
          ) : (
            orderedGroupKeys.map((key) => {
              const items = groups.get(key) ?? [];
              if (items.length === 0) return null;
              // Within group: unviewed first, soft-viewed last
              const sorted = [...items].sort((a, b) => {
                const aSoft = isSoftViewed(getViewedAt(views, a.id)) ? 1 : 0;
                const bSoft = isSoftViewed(getViewedAt(views, b.id)) ? 1 : 0;
                return aSoft - bSoft;
              });
              return (
                <section key={key}>
                  <h2 className="mb-4 text-xl font-bold text-[var(--text)]">{GROUP_TITLES[key]}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sorted.map((v) => {
                      const viewed = Boolean(getViewedAt(views, v.id));
                      return (
                        <VideoCard
                          key={v.id}
                          title={materialDisplayTitle(v)}
                          url={v.url}
                          description={v.description || undefined}
                          isNew={isNewMaterial(v.createdAt) && !viewed}
                          skillLevels={parseSkillLevels(v.skillLevels)}
                          viewed={viewed}
                          onMarkViewed={() => markViewed(v.id)}
                          onUnmarkViewed={() => unmarkViewed(v.id)}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
