"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StreamCard } from "@/components/StreamCard";
import { VideoCard } from "@/components/VideoCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DOTA_ROLE_LABELS, MATERIAL_TYPE_LABELS } from "@/lib/labels";
import {
  getViewedAt,
  isArchivedViewed,
  isNewMaterial,
  isSoftViewed,
  parseSkillLevels,
  type ViewedMap,
} from "@/lib/materials";
import { useMaterialViews } from "@/hooks/useMaterialViews";
import { extractTwitchLogin } from "@/lib/twitch";
import { materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type { LearningMaterial, MaterialType, DotaRole } from "@prisma/client";
import type { LiveStream } from "@/lib/twitch";

const ROLES = Object.keys(DOTA_ROLE_LABELS) as DotaRole[];

type Filter = "ALL" | "STREAM" | "ARTICLE";
type Tab = "active" | "viewed";

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
  initialViews = {},
}: {
  materials: LearningMaterial[];
  liveLogins: string[];
  liveStreams: LiveStream[];
  initialViews?: ViewedMap;
}) {
  const [typeFilter, setTypeFilter] = useState<Filter>("ALL");
  const [roleFilter, setRoleFilter] = useState<DotaRole | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const { views, markViewed, unmarkViewed } = useMaterialViews(initialViews);

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

  const { activeVideos, viewedVideos } = useMemo(() => {
    const active: LearningMaterial[] = [];
    const viewedList: LearningMaterial[] = [];
    for (const v of allVideos) {
      const at = getViewedAt(views, v.id);
      if (at) viewedList.push(v);
      if (!isArchivedViewed(at)) active.push(v);
    }
    active.sort((a, b) => {
      const aSoft = isSoftViewed(getViewedAt(views, a.id)) ? 1 : 0;
      const bSoft = isSoftViewed(getViewedAt(views, b.id)) ? 1 : 0;
      if (aSoft !== bSoft) return aSoft - bSoft;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    viewedList.sort((a, b) => {
      const ta = getViewedAt(views, a.id)?.getTime() ?? 0;
      const tb = getViewedAt(views, b.id)?.getTime() ?? 0;
      return tb - ta;
    });
    return { activeVideos: active, viewedVideos: viewedList };
  }, [allVideos, views]);

  const recentVideos = useMemo(
    () => activeVideos.filter((v) => isNewMaterial(v.createdAt) || isSoftViewed(getViewedAt(views, v.id))),
    [activeVideos, views]
  );

  const articlesAll = filtered.filter((m) => m.type === "ARTICLE");
  const { activeArticles, viewedArticles } = useMemo(() => {
    const active: LearningMaterial[] = [];
    const viewedList: LearningMaterial[] = [];
    for (const a of articlesAll) {
      const at = getViewedAt(views, a.id);
      if (at) viewedList.push(a);
      if (!isArchivedViewed(at)) active.push(a);
    }
    active.sort((a, b) => {
      const aSoft = isSoftViewed(getViewedAt(views, a.id)) ? 1 : 0;
      const bSoft = isSoftViewed(getViewedAt(views, b.id)) ? 1 : 0;
      if (aSoft !== bSoft) return aSoft - bSoft;
      return 0;
    });
    return { activeArticles: active, viewedArticles: viewedList };
  }, [articlesAll, views]);

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
    activeArticles.length > 0;

  const viewedCount = viewedVideos.length + viewedArticles.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-[var(--border-soft)] pb-3">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "active" ? chipActive : chipInactive
          }`}
        >
          Материалы
        </button>
        <button
          type="button"
          onClick={() => setTab("viewed")}
          className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "viewed" ? chipActive : chipInactive
          }`}
        >
          Просмотренные материалы
          {viewedCount > 0 && (
            <span className="ml-1.5 font-mono-num text-[var(--text-4)]">{viewedCount}</span>
          )}
        </button>
      </div>

      {tab === "viewed" ? (
        <ViewedTab
          videos={viewedVideos}
          articles={viewedArticles}
          onUnmark={unmarkViewed}
        />
      ) : (
        <>
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
                {recentVideos.map((v) => {
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

          {showArticles && activeArticles.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold text-[var(--text)]">Статьи</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {activeArticles.map((a) => {
                  const viewed = Boolean(getViewedAt(views, a.id));
                  return (
                    <ArticleCard
                      key={a.id}
                      article={a}
                      viewed={viewed}
                      onMark={() => markViewed(a.id)}
                      onUnmark={() => unmarkViewed(a.id)}
                    />
                  );
                })}
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

          {showStreams &&
            streamEntries.length > 0 &&
            liveStreamEntries.length === 0 &&
            offlineStreamEntries.length === 0 && (
              <p className="text-sm text-[var(--text-3)]">
                Сейчас никто из выбранных каналов не в эфире.
              </p>
            )}

          {!hasAnyContent && (
            <p className="text-[var(--text-3)]">
              {roleFilter || typeFilter !== "ALL"
                ? "Нет материалов для выбранного фильтра."
                : "Материалы скоро появятся."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ArticleCard({
  article,
  viewed,
  onMark,
  onUnmark,
}: {
  article: LearningMaterial;
  viewed: boolean;
  onMark: () => void;
  onUnmark: () => void;
}) {
  return (
    <Card className={viewed ? "opacity-55 grayscale" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className={viewed ? "text-[var(--text-3)]" : undefined}>{article.title}</CardTitle>
          {viewed && (
            <span className="shrink-0 font-mono-num text-[10px] uppercase tracking-wide text-[var(--text-4)]">
              Просмотрено
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{article.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-[var(--radius-control)] bg-[var(--points)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--points-hover)]"
            >
              Читать
            </a>
          )}
          {viewed ? (
            <Button type="button" variant="ghost" size="sm" onClick={onUnmark}>
              Вернуть в ленту
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={onMark}>
              Просмотрено
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ViewedTab({
  videos,
  articles,
  onUnmark,
}: {
  videos: LearningMaterial[];
  articles: LearningMaterial[];
  views?: ViewedMap;
  onUnmark: (id: string) => void;
}) {
  if (videos.length === 0 && articles.length === 0) {
    return (
      <p className="text-[var(--text-3)]">
        Здесь появятся материалы, которые вы отметите как просмотренные. Через неделю они остаются
        только в этой вкладке.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {videos.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-[var(--text)]">Видео</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                title={materialDisplayTitle(v)}
                url={v.url}
                description={v.description || undefined}
                skillLevels={parseSkillLevels(v.skillLevels)}
                viewed
                onUnmarkViewed={() => onUnmark(v.id)}
              />
            ))}
          </div>
        </section>
      )}
      {articles.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-[var(--text)]">Статьи</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {articles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                viewed
                onMark={() => {}}
                onUnmark={() => onUnmark(a.id)}
              />
            ))}
          </div>
        </section>
      )}
      <p className="text-xs text-[var(--text-4)]">
        Через 7 дней после отметки материал пропадает из основной ленты и остаётся только здесь.
      </p>
    </div>
  );
}
