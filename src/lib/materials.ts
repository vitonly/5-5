import type { LearningMaterial } from "@prisma/client";
import type { DotaRole, SkillLevel } from "@prisma/client";
import { DOTA_ROLE_POSITION } from "@/lib/labels";
import { parseJsonArray } from "@/lib/utils";

export const NEW_VIDEO_DAYS = 5;

export function isNewMaterial(createdAt: Date | string, days = NEW_VIDEO_DAYS): boolean {
  const created = new Date(createdAt);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return created >= cutoff;
}

export function parseSkillLevels(raw: string): SkillLevel[] {
  return parseJsonArray(raw) as SkillLevel[];
}

const SKILL_ORDER: Record<SkillLevel, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
};

export function compareVideos(a: LearningMaterial, b: LearningMaterial): number {
  const posA = parseJsonArray(a.positions) as DotaRole[];
  const posB = parseJsonArray(b.positions) as DotaRole[];
  const minPosA = posA.length ? Math.min(...posA.map((p) => DOTA_ROLE_POSITION[p])) : 99;
  const minPosB = posB.length ? Math.min(...posB.map((p) => DOTA_ROLE_POSITION[p])) : 99;
  if (minPosA !== minPosB) return minPosA - minPosB;

  const skillA = parseSkillLevels(a.skillLevels);
  const skillB = parseSkillLevels(b.skillLevels);
  const minSkillA = skillA.length ? Math.min(...skillA.map((s) => SKILL_ORDER[s])) : 99;
  const minSkillB = skillB.length ? Math.min(...skillB.map((s) => SKILL_ORDER[s])) : 99;
  if (minSkillA !== minSkillB) return minSkillA - minSkillB;

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function sortVideos(materials: LearningMaterial[]): LearningMaterial[] {
  return [...materials].sort(compareVideos);
}

export function groupVideosByPosition(videos: LearningMaterial[]) {
  const sorted = sortVideos(videos);
  const groups = new Map<string, LearningMaterial[]>();

  for (const video of sorted) {
    const positions = parseJsonArray(video.positions) as DotaRole[];
    if (positions.length === 0) {
      const list = groups.get("GENERAL") ?? [];
      list.push(video);
      groups.set("GENERAL", list);
      continue;
    }
    for (const pos of positions) {
      const list = groups.get(pos) ?? [];
      if (!list.some((v) => v.id === video.id)) list.push(video);
      groups.set(pos, list);
    }
  }

  return groups;
}
