"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ExternalLink, FileText, PlayCircle, RotateCcw } from "lucide-react";
import { OfflineStreamRow, StreamCard } from "@/components/StreamCard";
import { VideoCard } from "@/components/VideoCard";
import { Button } from "@/components/ui/button";
import { FilterChips, Segmented } from "@/components/ui/segmented";
import { SectionHeader } from "@/components/home/SectionHeader";
import { EmptyState, LiveDot, roleFilterItems } from "@/components/materials/shared";
import { MATERIAL_TYPE_LABELS, SKILL_LEVEL_LABELS } from "@/lib/labels";
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
import { cn, materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type { LearningMaterial, DotaRole, SkillLevel } from "@prisma/client";
import type { LiveStream } from "@/lib/twitch";

type Filter = "ALL" | "STREAM" | "ARTICLE" | "VIDEO";
type Tab = "active" | "viewed";

const LEVELS = Object.keys(SKILL_LEVEL_LABELS) as SkillLevel[];

function materialMatchesRole(m: LearningMaterial, roleFilter: DotaRole | null) {
  if (!roleFilter) return true;
  const pos = parseJsonArray(m.positions) as DotaRole[];
  if (pos.length === 0) return true;
  return pos.includes(roleFilter);
}

function materialMatchesLevel(m: LearningMaterial, levelFilter: SkillLevel | null) {
  if (!levelFilter) return true;
  const levels = parseSkillLevels(m.skillLevels);
  if (levels.length === 0) return true;
  return levels.includes(levelFilter);
}

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
  const [levelFilter, setLevelFilter] = useState<SkillLevel | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [liveLoginsState, setLiveLoginsState] = useState(liveLogins);
  const [liveStreamsState, setLiveStreamsState] = useState(liveStreams);
  const { views, markViewed, unmarkViewed } = useMaterialViews(initialViews);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/streams/live");
        if (!res.ok) return;
        const data = (await res.json()) as {
          liveLogins?: string[];
          liveStreams?: LiveStream[];
        };
        if (cancelled) return;
        setLiveLoginsState(data.liveLogins ?? []);
        setLiveStreamsState(data.liveStreams ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (typeFilter !== "ALL" && m.type !== typeFilter) return false;
      if (!materialMatchesRole(m, roleFilter)) return false;
      if (m.type === "VIDEO" && !materialMatchesLevel(m, levelFilter)) return false;
      return true;
    });
  }, [materials, typeFilter, roleFilter, levelFilter]);

  // для «Просмотренные» — без фильтра типа, чтобы счётчик и список не пустели
  const videosForViews = useMemo(
    () =>
      materials.filter(
        (m) =>
          m.type === "VIDEO" &&
          materialMatchesRole(m, roleFilter) &&
          materialMatchesLevel(m, levelFilter)
      ),
    [materials, roleFilter, levelFilter]
  );

  const feedVideos = useMemo(
    () => filtered.filter((m) => m.type === "VIDEO"),
    [filtered]
  );

  const { activeVideos, viewedVideos } = useMemo(() => {
    const active: LearningMaterial[] = [];
    const viewedList: LearningMaterial[] = [];
    for (const v of feedVideos) {
      const at = getViewedAt(views, v.id);
      if (!isArchivedViewed(at)) active.push(v);
    }
    for (const v of videosForViews) {
      const at = getViewedAt(views, v.id);
      if (at) viewedList.push(v);
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
  }, [feedVideos, videosForViews, views]);

  const articlesAll = filtered.filter((m) => m.type === "ARTICLE");
  const articlesForViews = useMemo(
    () => materials.filter((m) => m.type === "ARTICLE" && materialMatchesRole(m, roleFilter)),
    [materials, roleFilter]
  );

  const { activeArticles, viewedArticles } = useMemo(() => {
    const active: LearningMaterial[] = [];
    const viewedList: LearningMaterial[] = [];
    for (const a of articlesAll) {
      const at = getViewedAt(views, a.id);
      if (!isArchivedViewed(at)) active.push(a);
    }
    for (const a of articlesForViews) {
      const at = getViewedAt(views, a.id);
      if (at) viewedList.push(a);
    }
    active.sort((a, b) => {
      const aSoft = isSoftViewed(getViewedAt(views, a.id)) ? 1 : 0;
      const bSoft = isSoftViewed(getViewedAt(views, b.id)) ? 1 : 0;
      if (aSoft !== bSoft) return aSoft - bSoft;
      return 0;
    });
    return { activeArticles: active, viewedArticles: viewedList };
  }, [articlesAll, articlesForViews, views]);

  const streamEntries = useMemo(() => {
    return filtered
      .filter((m) => m.type === "STREAM")
      .map((material) => ({
        material,
        login: extractTwitchLogin(material.url || material.title || ""),
      }))
      .filter((e): e is { material: LearningMaterial; login: string } => Boolean(e.login));
  }, [filtered]);

  const liveLoginSet = useMemo(
    () => new Set(liveLoginsState.map((l) => l.toLowerCase())),
    [liveLoginsState]
  );

  const liveByLogin = useMemo(() => {
    const map = new Map<string, LiveStream>();
    for (const s of liveStreamsState) map.set(s.login.toLowerCase(), s);
    return map;
  }, [liveStreamsState]);

  const liveStreamEntries = streamEntries.filter(({ login }) => liveLoginSet.has(login));
  const offlineStreamEntries = streamEntries.filter(({ login }) => !liveLoginSet.has(login));

  const showStreams = typeFilter === "ALL" || typeFilter === "STREAM";
  const showArticles = typeFilter === "ALL" || typeFilter === "ARTICLE";
  const showVideos = typeFilter === "ALL" || typeFilter === "VIDEO";
  const showLevelFilter = showVideos;

  const hasAnyContent =
    (showStreams && (liveStreamEntries.length > 0 || offlineStreamEntries.length > 0)) ||
    (showVideos && activeVideos.length > 0) ||
    (showArticles && activeArticles.length > 0);

  const viewedCount = viewedVideos.length + viewedArticles.length;

  const sortedLive = [...liveStreamEntries]
    .sort((a, b) => (liveByLogin.get(b.login)?.viewers ?? 0) - (liveByLogin.get(a.login)?.viewers ?? 0))
    .slice(0, 6);

  const videoCard = (v: LearningMaterial) => {
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
          { value: "active", label: "Лента" },
          { value: "viewed", label: "Просмотренные", count: viewedCount || undefined },
        ]}
      />

      {tab === "viewed" ? (
        <ViewedTab videos={viewedVideos} articles={viewedArticles} onUnmark={unmarkViewed} />
      ) : (
        <>
          <div className="space-y-2.5">
            <FilterChips
              label="Тип"
              value={typeFilter === "ALL" ? null : typeFilter}
              onChange={(v) => setTypeFilter(v ?? "ALL")}
              items={[
                { value: null, label: "Всё" },
                { value: "STREAM" as const, label: MATERIAL_TYPE_LABELS.STREAM },
                { value: "VIDEO" as const, label: MATERIAL_TYPE_LABELS.VIDEO },
                { value: "ARTICLE" as const, label: MATERIAL_TYPE_LABELS.ARTICLE },
              ]}
            />
            <FilterChips label="Позиция" value={roleFilter} onChange={setRoleFilter} items={roleFilterItems()} />
            {showLevelFilter && (
              <FilterChips
                label="Уровень"
                value={levelFilter}
                onChange={setLevelFilter}
                items={[
                  { value: null, label: "Все уровни" },
                  ...LEVELS.map((l) => ({ value: l, label: SKILL_LEVEL_LABELS[l] })),
                ]}
              />
            )}
          </div>

          {showStreams && sortedLive.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <LiveDot />
                <h2 className="text-[17px] leading-snug min-[720px]:text-[20px]">Сейчас в эфире</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedLive.map(({ material, login }) => (
                  <StreamCard key={material.id} material={material} login={login} live={liveByLogin.get(login)} />
                ))}
              </div>
            </section>
          )}

          {showVideos && activeVideos.length > 0 && (
            <section>
              <SectionHeader title="Видео" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeVideos.map(videoCard)}
              </div>
            </section>
          )}

          {showArticles && activeArticles.length > 0 && (
            <section>
              <SectionHeader title="Статьи" />
              <div className="grid gap-3 md:grid-cols-2">
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
              <SectionHeader title="Каналы тренеров" />
              <div className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
                {offlineStreamEntries.map(({ material, login }) => (
                  <OfflineStreamRow key={material.id} material={material} login={login} />
                ))}
              </div>
            </section>
          )}

          {!hasAnyContent && (
            <EmptyState
              icon={typeFilter === "VIDEO" ? <PlayCircle /> : <BookOpen />}
              title={roleFilter || typeFilter !== "ALL" || levelFilter ? "Ничего не нашлось" : "Материалы скоро появятся"}
              text={
                roleFilter || typeFilter !== "ALL" || levelFilter ? "Попробуйте другой фильтр." : undefined
              }
            />
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
    <article
      className={cn(
        "surface-card flex flex-col p-4",
        viewed && "border-[var(--border-soft)]"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
            viewed ? "bg-[var(--control)] text-[var(--text-3)]" : "bg-[var(--points-bg)] text-[var(--points)]"
          )}
        >
          <FileText className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "text-[15px] font-semibold leading-snug",
              viewed ? "text-[var(--text-3)]" : "text-[var(--text)]"
            )}
          >
            {article.title}
          </h3>
          {article.description && (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-2)]">
              {article.description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 pl-[52px]">
        {article.url && (
          <Button asChild size="sm" variant={viewed ? "outline" : "default"}>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              Читать
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
        {viewed ? (
          <Button type="button" variant="ghost" size="sm" onClick={onUnmark}>
            <RotateCcw aria-hidden />
            Вернуть в ленту
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={onMark}>
            <Check aria-hidden />
            Прочитано
          </Button>
        )}
      </div>
    </article>
  );
}

function ViewedTab({
  videos,
  articles,
  onUnmark,
}: {
  videos: LearningMaterial[];
  articles: LearningMaterial[];
  onUnmark: (id: string) => void;
}) {
  if (videos.length === 0 && articles.length === 0) {
    return (
      <EmptyState
        icon={<Check />}
        title="Пока ничего не отмечено"
        text="Отмечайте видео и статьи просмотренными — через неделю они уходят из ленты и остаются здесь."
      />
    );
  }

  return (
    <div className="space-y-8">
      {videos.length > 0 && (
        <section>
          <SectionHeader title="Видео" />
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
          <SectionHeader title="Статьи" />
          <div className="grid gap-3 md:grid-cols-2">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} viewed onMark={() => {}} onUnmark={() => onUnmark(a.id)} />
            ))}
          </div>
        </section>
      )}
      <p className="text-xs text-[var(--text-3)]">
        Через 7 дней после отметки материал пропадает из основной ленты и остаётся только здесь.
      </p>
    </div>
  );
}
