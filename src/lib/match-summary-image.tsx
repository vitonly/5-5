import { readFile } from "fs/promises";
import { withSnapshot } from "@/lib/match-power-snapshot";
import path from "path";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { getDaySummary } from "@/lib/match-summary";
import { seriesScoreByGame1Roster } from "@/lib/match-score";
import { teamDisplayName } from "@/lib/team-names";
import { heroInfo } from "@/lib/replay";
import { absolutePublicUrl, localUploadPath } from "@/lib/telegram";
import { displayName, parseJsonArray } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
import { HALL_POINTS } from "@/lib/hall-of-fame";

/** Картинка «Итоги дня» 1080×1350 для Telegram / ВК */

const FONT_DIR = path.join(process.cwd(), "src", "assets", "og-fonts");
let fontsCache: Awaited<ReturnType<typeof loadFonts>> | null = null;

async function loadFonts() {
  const f = (file: string) => readFile(path.join(FONT_DIR, file));
  const [ul, uc, p4l, p4c, p6l, p6c, ml, mc] = await Promise.all([
    f("unbounded-latin-700-normal.woff"),
    f("unbounded-cyrillic-700-normal.woff"),
    f("ibm-plex-sans-latin-400-normal.woff"),
    f("ibm-plex-sans-cyrillic-400-normal.woff"),
    f("ibm-plex-sans-latin-600-normal.woff"),
    f("ibm-plex-sans-cyrillic-600-normal.woff"),
    f("jetbrains-mono-latin-700-normal.woff"),
    f("jetbrains-mono-cyrillic-700-normal.woff"),
  ]);
  return [
    { name: "Unbounded", data: ul, weight: 700 as const, style: "normal" as const },
    { name: "UnboundedCyr", data: uc, weight: 700 as const, style: "normal" as const },
    { name: "Plex", data: p4l, weight: 400 as const, style: "normal" as const },
    { name: "PlexCyr", data: p4c, weight: 400 as const, style: "normal" as const },
    { name: "Plex", data: p6l, weight: 600 as const, style: "normal" as const },
    { name: "PlexCyr", data: p6c, weight: 600 as const, style: "normal" as const },
    { name: "Mono", data: ml, weight: 700 as const, style: "normal" as const },
    { name: "MonoCyr", data: mc, weight: 700 as const, style: "normal" as const },
  ];
}

async function photoSrc(url: string | null | undefined) {
  if (!url) return null;
  const local = localUploadPath(url);
  if (local) {
    const buf = await readFile(local);
    const ext = path.extname(local).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    if (mime === "image/webp") return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
  return remoteSrc(absolutePublicUrl(url));
}

/**
 * Откуда сервер может скачивать картинки. Адрес аватарки задаёт сам ученик,
 * поэтому без списка сервер можно было заставить обращаться к любым адресам (SSRF).
 */
const IMAGE_HOSTS = [/(^|\.)steamstatic\.com$/i, /^t\.me$/i, /(^|\.)telesco\.pe$/i, /(^|\.)userapi\.com$/i, /(^|\.)vk\.com$/i];

function isAllowedImageUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const own = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : null;
    return u.hostname === own || IMAGE_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const heroCache = new Map<string, string | null>();
async function remoteSrc(url: string | null) {
  if (!url || !isAllowedImageUrl(url)) return null;
  if (heroCache.has(url)) return heroCache.get(url)!;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "error" });
    if (!res.ok) throw new Error(String(res.status));
    const type = res.headers.get("content-type") || "image/png";
    const data = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    heroCache.set(url, data);
    return data;
  } catch {
    heroCache.set(url, null);
    return null;
  }
}

const F = { display: "Unbounded, UnboundedCyr", body: "Plex, PlexCyr", mono: "Mono, MonoCyr" };

const C = {
  bg: "#0b2a2c",
  card: "#133b3e",
  line: "#1c4a4d",
  text: "#ffffff",
  muted: "#9cc7c8",
  accent: "#4fd1d6",
  gold: "#e2b546",
  goldInk: "#3d2b00",
  danger: "#ff8a80",
};

export type DaySummaryImageResult =
  | { ok: true; response: ImageResponse; date: Date; filename: string }
  | { ok: false; status: number; error: string };

/** Собрать ImageResponse итогов дня (для API и рассылки в Telegram). */
export async function buildDaySummaryImage(sessionId: string): Promise<DaySummaryImageResult> {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: { games: { include: { participants: true }, orderBy: { gameNumber: "asc" } }, replays: true },
  });
  if (!session) return { ok: false, status: 404, error: "Матч не найден" };
  const summary = await getDaySummary(session);
  if (!summary) return { ok: false, status: 400, error: "Итоги появятся после завершения матча" };

  const radiant = parseJsonArray(session.radiantPlayerIds);
  const dire = parseJsonArray(session.direPlayerIds);
  const ids = new Set<string>([...radiant, ...dire, ...summary.awards.map((a) => a.userId), ...summary.hall.map((h) => h.userId)]);
  if (summary.mvp) ids.add(summary.mvp.userId);
  for (const uid of summary.predictions?.correctUserIds ?? []) ids.add(uid);
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, firstName: true, lastName: true, username: true, photoUrl: true, profile: { select: { finalRating: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  // Сила — замороженная на день игры (lib/match-power.ts)
  const power = withSnapshot(
    Object.fromEntries(users.map((u) => [u.id, u.profile?.finalRating ?? 0])),
    session.powerSnapshot
  );
  const named = (list: string[]) =>
    list.map((uid) => {
      const u = byId.get(uid);
      return { id: uid, firstName: u?.firstName, lastName: u?.lastName, username: u?.username, finalRating: power[uid] ?? 0 };
    });
  const leftName = teamDisplayName(named(radiant), "Team A");
  const rightName = teamDisplayName(named(dire), "Team B");
  const { radiantWins, direWins } = seriesScoreByGame1Roster(session, power);
  const nameOf = (uid: string) => (byId.get(uid) ? displayName(byId.get(uid)!) : "Игрок");
  const mvpUser = summary.mvp ? byId.get(summary.mvp.userId) : undefined;
  const mvpPhoto = await photoSrc(mvpUser?.photoUrl);
  const hallRecords = summary.hall.filter((h) => !h.anti);
  const heroImgs = await Promise.all(summary.awards.map((a) => remoteSrc(heroInfo(a.heroId).img)));
  const predNames =
    summary.predictions?.correctUserIds.map((id) => nameOf(id)).filter(Boolean) ?? [];

  const image = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontFamily: F.body, padding: 72, gap: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: F.display, fontSize: 36 }}>
          СТАРТ<span style={{ color: C.accent }}>+</span>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: C.muted }}>Субботние 5v5 · {formatShortDate(session.date)}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "30px 0", borderTop: `2px solid ${C.line}`, borderBottom: `2px solid ${C.line}` }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: C.muted }}>ИТОГ СЕРИИ</div>
        <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 36 }}>
          <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", fontFamily: F.display, fontSize: 32, textAlign: "right" }}>{leftName}</div>
          <div style={{ display: "flex", fontFamily: F.display, fontSize: 112, lineHeight: 1 }}>
            {radiantWins}
            <span style={{ color: "#4c7c7e", margin: "0 18px" }}>:</span>
            {direWins}
          </div>
          <div style={{ display: "flex", flex: 1, fontFamily: F.display, fontSize: 32, color: C.muted }}>{rightName}</div>
        </div>
      </div>

      {summary.mvp && mvpUser && (
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ display: "flex", width: 300, height: 300, borderRadius: 28, overflow: "hidden", border: `5px solid ${C.gold}`, background: C.line, alignItems: "center", justifyContent: "center" }}>
            {mvpPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mvpPhoto} width={300} height={300} style={{ objectFit: "cover", width: 300, height: 300 }} alt="" />
            ) : (
              <div style={{ display: "flex", fontFamily: F.display, fontSize: 90, color: C.muted }}>
                {(mvpUser.firstName[0] ?? "") + (mvpUser.lastName?.[0] ?? "")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
            <div style={{ display: "flex", alignSelf: "flex-start", padding: "8px 22px", borderRadius: 999, background: C.gold, color: C.goldInk, fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>
              MVP ДНЯ
            </div>
            <div style={{ display: "flex", fontFamily: F.display, fontSize: 54, lineHeight: 1.05 }}>{displayName(mvpUser)}</div>
            <div style={{ display: "flex", fontSize: 26, color: C.muted }}>
              {[summary.mvp.heroIds.map((h) => heroInfo(h).name).join(", "), summary.mvp.points > 0 ? `+${summary.mvp.points} очк. за день` : ""]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {summary.awards.map((a, i) => {
          const heroImg = heroImgs[i];
          return (
            <div key={a.key} style={{ display: "flex", width: 458, alignItems: "center", gap: 18, padding: "22px 24px", borderRadius: 22, background: C.card }}>
              {heroImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroImg} width={96} height={54} style={{ borderRadius: 8 }} alt="" />
              ) : (
                <div style={{ display: "flex", width: 96, height: 54 }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
                <div style={{ display: "flex", fontSize: 17, letterSpacing: 2, color: C.accent }}>{a.title.toUpperCase()}</div>
                <div style={{ display: "flex", fontSize: 26, fontWeight: 600 }}>{nameOf(a.userId)}</div>
              </div>
              <div style={{ display: "flex", fontFamily: F.mono, fontSize: 30 }}>{a.display}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "flex-end", fontSize: 23, color: C.muted, gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, width: "100%" }}>
          {hallRecords.slice(0, 2).map((h) => (
            <div
              key={h.code}
              style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", width: "100%" }}
            >
              <span style={{ display: "flex", color: C.gold, marginRight: 10 }}>Зал славы +{HALL_POINTS}</span>
              <span style={{ display: "flex" }}>
                {h.title}: {h.display} — {nameOf(h.userId)}
              </span>
            </div>
          ))}
          {hallRecords.length > 2 && (
            <div style={{ display: "flex", width: "100%" }}>
              и ещё {hallRecords.length - 2} рекорд(а) в Зале славы
            </div>
          )}
          {predNames.length > 0 && (
            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", width: "100%", marginTop: 4 }}>
              <span style={{ display: "flex", color: C.accent, marginRight: 10 }}>Прогноз дня</span>
              <span style={{ display: "flex" }}>угадали: {predNames.join(", ")}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontFamily: F.display, fontSize: 24, color: C.text }}>startdota.ru</div>
      </div>
    </div>
  );

  fontsCache ??= await loadFonts();
  const day = new Date(session.date).toISOString().slice(0, 10);
  return {
    ok: true,
    date: session.date,
    filename: `startplus-itogi-${day}.png`,
    response: new ImageResponse(image, {
      width: 1080,
      height: 1350,
      fonts: fontsCache,
    }),
  };
}

/** PNG-буфер для отправки в Telegram. */
export async function renderDaySummaryPng(sessionId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const built = await buildDaySummaryImage(sessionId);
  if (!built.ok) return null;
  const buf = Buffer.from(await built.response.arrayBuffer());
  if (buf.length < 100 || buf[0] !== 0x89) return null;
  return { buffer: buf, filename: built.filename };
}
