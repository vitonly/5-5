"use client";

import { useMemo, useState } from "react";
import { Check, PlayCircle } from "lucide-react";
import { VideoCard } from "@/components/VideoCard";
import { PositionBadge } from "@/components/RoleIcon";
import { FilterChips, Segmented } from "@/components/ui/segmented";
import { EmptyState, ROLES, roleFilterItems, roleName } from "@/components/materials/shared";
import { DOTA_ROLE_POSITION, SKILL_LEVEL_LABELS } from "@/lib/labels";
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

const LEVELS = Object.keys(SKILL_LEVEL_LABELS) as SkillLevel[];

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

  const card = (v: LearningMaterial) => {
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
  };

  return (
    <div className="space-y-6">
      <Segmented
        value={tab}
        onChange={setTab}
        items={[
          { value: "active", label: "Видео", count: activeVideos.length },
          { value: "viewed", label: "Просмотренные", count: viewedVideos.length || undefined },
        ]}
      />

      {tab === "viewed" ? (
        viewedVideos.length === 0 ? (
          <EmptyState
            icon={<Check />}
            title="Пока ничего не отмечено"
            text="Отмеченные видео через неделю уходят из ленты и остаются здесь."
          />
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
          <div className="space-y-2.5">
            <FilterChips label="Позиция" value={roleFilter} onChange={setRoleFilter} items={roleFilterItems()} />
            <FilterChips
              label="Уровень"
              value={levelFilter}
              onChange={setLevelFilter}
              items={[
                { value: null, label: "Все уровни" },
                ...LEVELS.map((l) => ({ value: l, label: SKILL_LEVEL_LABELS[l] })),
              ]}
            />
          </div>

          {activeVideos.length === 0 ? (
            <EmptyState icon={<PlayCircle />} title="Видео не найдены" text="Попробуйте другой фильтр." />
          ) : (
            orderedGroupKeys.map((key) => {
              const items = groups.get(key) ?? [];
              if (items.length === 0) return null;
              // внутри группы: непросмотренные сверху
              const sorted = [...items].sort((a, b) => {
                const aSoft = isSoftViewed(getViewedAt(views, a.id)) ? 1 : 0;
                const bSoft = isSoftViewed(getViewedAt(views, b.id)) ? 1 : 0;
                return aSoft - bSoft;
              });
              return (
                <section key={key}>
                  <div className="mb-3 flex items-center gap-2">
                    {key !== "GENERAL" && <PositionBadge position={DOTA_ROLE_POSITION[key as DotaRole]} />}
                    <h2 className="text-[17px] leading-snug min-[720px]:text-[20px]">
                      {key === "GENERAL" ? "Общие видео" : roleName(key as DotaRole)}
                    </h2>
                    <span className="font-mono-num text-[13px] text-[var(--text-3)]">{sorted.length}</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sorted.map(card)}</div>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
