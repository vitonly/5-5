"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronRight, ExternalLink, FileText, PlayCircle, RotateCcw } from "lucide-react";
import { OfflineStreamRow, StreamCard } from "@/components/StreamCard";
import { VideoCard } from "@/components/VideoCard";
import { Button } from "@/components/ui/button";
import { FilterChips, Segmented } from "@/components/ui/segmented";
import { SectionHeader } from "@/components/home/SectionHeader";
import { EmptyState, LiveDot, roleFilterItems } from "@/components/materials/shared";
import { MATERIAL_TYPE_LABELS } from "@/lib/labels";
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
import type { LearningMaterial, DotaRole } from "@prisma/client";
import type { LiveStream } from "@/lib/twitch";

type Filter = "ALL" | "STREAM" | "ARTICLE";
type Tab = "active" | "viewed";

function materialMatchesRole(m: LearningMaterial, roleFilter: DotaRole | null) {
  if (!roleFilter) return true;
  const pos = parseJsonArray(m.positions) as DotaRole[];
  if (pos.length === 0) return true;
  return pos.includes(roleFilter);
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
  const showVideos = typeFilter === "ALL";

  const hasAnyContent =
    liveStreamEntries.length > 0 ||
    offlineStreamEntries.length > 0 ||
    recentVideos.length > 0 ||
    activeArticles.length > 0;

  const viewedCount = viewedVideos.length + viewedArticles.length;

  const sortedLive = [...liveStreamEntries]
    .sort((a, b) => (liveByLogin.get(b.login)?.viewers ?? 0) - (liveByLogin.get(a.login)?.viewers ?? 0))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { value: "active", label: "Лента" },
            { value: "viewed", label: "Просмотренные", count: viewedCount || undefined },
          ]}
        />
        <Link
          href="/materials/videos"
          className="press inline-flex h-11 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-sm font-medium text-[var(--text)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--points-border)] min-[720px]:h-10"
        >
          <span className="inline-flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-[var(--points)]" aria-hidden />
            Видеотека по позициям
          </span>
          <ChevronRight className="h-4 w-4 text-[var(--text-3)]" aria-hidden />
        </Link>
      </div>

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
                { value: "ARTICLE" as const, label: MATERIAL_TYPE_LABELS.ARTICLE },
              ]}
            />
            <FilterChips label="Позиция" value={roleFilter} onChange={setRoleFilter} items={roleFilterItems()} />
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

          {showVideos && recentVideos.length > 0 && (
            <section>
              <SectionHeader title="Новые видео" href="/materials/videos" linkLabel="Все видео" />
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
              icon={<BookOpen />}
              title={roleFilter || typeFilter !== "ALL" ? "Ничего не нашлось" : "Материалы скоро появятся"}
              text={roleFilter || typeFilter !== "ALL" ? "Попробуйте другой фильтр." : undefined}
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
