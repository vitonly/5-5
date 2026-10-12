import { Star } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { MATCH_STATUS_LABELS, POSITION_LABELS } from "@/lib/labels";
import { cn, displayName, parseJsonArray } from "@/lib/utils";
import { formatShortDate, formatShortDateTime } from "@/lib/format";
import { formatPoints } from "@/lib/points";
import { PlayerLink } from "@/components/PlayerLink";
import { MatchNav } from "@/components/MatchNav";
import { CountUp } from "@/components/fx/CountUp";
import { lineupForTeam, parseTeamAssignments, type LineupSlot } from "@/lib/match-lineup";
import { MatchMvpClient } from "@/components/MatchMvpClient";
import { teamDisplayName } from "@/lib/team-names";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  profile: { finalRating: number } | null;
};

type Viewer = { id: string; role: string };

type SessionWithGames = Awaited<ReturnType<typeof loadSessions>>[number];

async function loadSessions() {
  return prisma.matchSession.findMany({
    include: {
      games: {
        include: { participants: true },
        orderBy: { gameNumber: "asc" },
      },
    },
    orderBy: { date: "desc" },
    take: 10,
  });
}

export default async function MatchPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const sessions = await loadSessions();

  const allIds = [
    ...new Set(
      sessions.flatMap((s) => [...parseJsonArray(s.radiantPlayerIds), ...parseJsonArray(s.direPlayerIds)])
    ),
  ];

  const users = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      profile: { select: { finalRating: true } },
    },
  });
  const userMap: Record<string, UserRow> = Object.fromEntries(users.map((u) => [u.id, u]));

  // Главный матч — ближайший незавершённый, иначе последний сыгранный
  const featured = sessions.find((s) => s.status !== "COMPLETED") ?? sessions[0];
  const rest = sessions.filter((s) => s.id !== featured?.id);
  const numberOf = (s: SessionWithGames) => sessions.length - sessions.indexOf(s);

  return (
    <div>
      <h1 className="mb-5">Субботние 5v5</h1>
      <MatchNav />

      {!featured ? (
        <p className="surface-card px-4 py-10 text-center text-sm text-[var(--text-3)]">
          Матчи ещё не запланированы
        </p>
      ) : (
        <div className="space-y-8">
          <MatchCard session={featured} number={numberOf(featured)} userMap={userMap} viewer={user} />

          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] leading-snug min-[720px]:text-[20px]">Прошлые матчи</h2>
              <ul className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
                {rest.map((s) => (
                  <li key={s.id}>
                    <PastMatchRow session={s} number={numberOf(s)} userMap={userMap} viewer={user} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- данные матча ---------- */

function matchData(session: SessionWithGames, userMap: Record<string, UserRow>, viewer: Viewer) {
  const radiant = parseJsonArray(session.radiantPlayerIds);
  const dire = parseJsonArray(session.direPlayerIds);
  const named = (ids: string[]) =>
    ids.map((id) => ({
      id,
      firstName: userMap[id]?.firstName,
      lastName: userMap[id]?.lastName,
      username: userMap[id]?.username,
      finalRating: userMap[id]?.profile?.finalRating ?? 0,
    }));
  const radiantName = teamDisplayName(named(radiant), "Team A");
  const direName = teamDisplayName(named(dire), "Team B");
  const radiantWins = session.games.filter((g) => g.winnerTeam === "RADIANT").length;
  const direWins = session.games.filter((g) => g.winnerTeam === "DIRE").length;
  const lastGame = session.games[session.games.length - 1];
  const assignments = parseTeamAssignments(session.teamAssignments);

  return {
    radiant,
    dire,
    radiantName,
    direName,
    radiantWins,
    direWins,
    radiantPower: sumPower(radiant, userMap),
    direPower: sumPower(dire, userMap),
    radiantPoints: lastGame ? sumPoints(lastGame.participants, radiant) : 0,
    direPoints: lastGame ? sumPoints(lastGame.participants, dire) : 0,
    radiantLineup: lineupForTeam("RADIANT", radiant, assignments),
    direLineup: lineupForTeam("DIRE", dire, assignments),
    myTeam: radiant.includes(viewer.id) ? "RADIANT" : dire.includes(viewer.id) ? "DIRE" : null,
    lineupsVisible:
      (session.status === "LINEUPS_CONFIRMED" ||
        session.status === "IN_PROGRESS" ||
        session.status === "COMPLETED") &&
      (radiant.length > 0 || dire.length > 0),
  };
}

/* ---------- карточка матча (табло) ---------- */

function MatchCard({
  session,
  number,
  userMap,
  viewer,
  embedded = false,
}: {
  session: SessionWithGames;
  number: number;
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  embedded?: boolean;
}) {
  const d = matchData(session, userMap, viewer);
  const mvp = session.mvpResolved && session.mvpWinnerId ? userMap[session.mvpWinnerId] : null;
  const hasGames = session.games.length > 0;
  const live = session.status === "IN_PROGRESS";

  return (
    <article className={cn(!embedded && "surface-card overflow-hidden")}>
      {!embedded && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3 min-[720px]:px-6">
          <div className="min-w-0">
            <p className="eyebrow">Матч #{number}</p>
            <p className="text-[15px] font-semibold text-[var(--text)]">{formatShortDateTime(session.date)}</p>
          </div>
          <Badge variant={live ? "points" : session.status === "COMPLETED" ? "default" : "power"}>
            {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--points)]" aria-hidden />}
            {MATCH_STATUS_LABELS[session.status]}
          </Badge>
        </header>
      )}

      {(d.myTeam && d.lineupsVisible) || mvp ? (
        <div className="flex flex-wrap gap-2 px-4 pt-4 min-[720px]:px-6">
          {d.myTeam && d.lineupsVisible && (
            <Badge variant="points">Твоя команда: {d.myTeam === "RADIANT" ? d.radiantName : d.direName}</Badge>
          )}
          {mvp && (
            <Badge variant="warning">
              <Star className="h-3 w-3 fill-current" aria-hidden />
              MVP дня: {displayName(mvp)}
            </Badge>
          )}
        </div>
      ) : null}

      {/* Табло */}
      {d.lineupsVisible && (
        <div className="mx-auto max-w-[820px] px-4 pb-5 pt-4 min-[720px]:px-6 min-[720px]:pb-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <TeamHead name={d.radiantName} side="radiant" />
            <div className="text-center">
              {hasGames ? (
                <p className="font-display text-[30px] font-bold leading-none tracking-tight min-[720px]:text-[40px]">
                  <CountUp value={d.radiantWins} />
                  <span className="mx-1.5 text-[var(--text-3)]">:</span>
                  <CountUp value={d.direWins} />
                </p>
              ) : (
                <p className="font-display text-[20px] font-bold text-[var(--text-3)]">VS</p>
              )}
            </div>
            <TeamHead name={d.direName} side="dire" />
          </div>

          {/* Сравнение силы */}
          <PowerCompare radiant={d.radiantPower} dire={d.direPower} />

          {/* Составы зеркально по позициям */}
          <MirrorLineup
            radiant={d.radiantLineup}
            dire={d.direLineup}
            userMap={userMap}
            viewer={viewer}
            mvpId={session.mvpWinnerId}
          />

          {hasGames && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-soft)] pt-4 text-[13px]">
              {session.games.map((g) => {
                const winner =
                  g.winnerTeam === "RADIANT" ? d.radiantName : g.winnerTeam === "DIRE" ? d.direName : "Ничья";
                const dot =
                  g.winnerTeam === "RADIANT"
                    ? "bg-[var(--success)]"
                    : g.winnerTeam === "DIRE"
                      ? "bg-[var(--danger)]"
                      : "bg-[var(--text-4)]";
                return (
                  <span
                    key={g.id}
                    className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--control)] px-2.5 py-1 text-[var(--text-2)]"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
                    Игра {g.gameNumber}:
                    <span className="min-w-0 truncate font-medium text-[var(--text)]">{winner}</span>
                  </span>
                );
              })}
              {(d.radiantPoints !== 0 || d.direPoints !== 0) && (
                <span className="ml-auto text-[12px] text-[var(--text-3)]">
                  очки за последнюю игру:{" "}
                  <span className="font-mono-num text-[var(--points)]">{formatPoints(d.radiantPoints)}</span>
                  {" / "}
                  <span className="font-mono-num text-[var(--points)]">{formatPoints(d.direPoints)}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Команды набраны, составы скрыты */}
      {session.status === "TEAMS_SET" && (d.radiant.length > 0 || d.dire.length > 0) && (
        <div className="px-4 py-4 min-[720px]:px-6">
          <p className="mb-3 text-sm text-[var(--text-3)]">
            Игроки набраны. Составы ещё не утверждены — команды и позиции скрыты.
          </p>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {[...d.radiant, ...d.dire].map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-5 text-right font-mono-num text-[12px] text-[var(--text-3)]">{i + 1}</span>
                {userMap[id] ? <PlayerLink user={userMap[id]} viewer={viewer} /> : id}
              </li>
            ))}
          </ol>
        </div>
      )}

      {session.status === "PLANNED" && !d.lineupsVisible && (
        <p className="px-4 py-5 text-sm text-[var(--text-3)] min-[720px]:px-6">
          {session.mode === "OPEN_SIGNUP" && "Запись идёт в Telegram-боте. "}
          Составы появятся здесь, когда тренер их утвердит.
        </p>
      )}

      {/* Голосование за MVP */}
      {(session.status === "COMPLETED" || session.mvpResolved) &&
        (d.radiant.includes(viewer.id) || d.dire.includes(viewer.id)) && (
          <div className="border-t border-[var(--border-soft)] px-4 py-4 min-[720px]:px-6">
            <MatchMvpClient
              sessionId={session.id}
              nominees={[...d.radiant, ...d.dire]
                .filter((id) => id !== viewer.id)
                .map((id) => userMap[id])
                .filter(Boolean)
                .map((u) => ({
                  id: u.id,
                  firstName: u.firstName,
                  lastName: u.lastName,
                  username: u.username,
                }))}
            />
          </div>
        )}
    </article>
  );
}

function TeamHead({ name, side }: { name: string; side: "radiant" | "dire" }) {
  const right = side === "dire";
  return (
    <div className={cn("min-w-0", right && "text-right")}>
      <p className={cn("flex items-center gap-2", right && "flex-row-reverse")}>
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            side === "radiant" ? "bg-[var(--success)]" : "bg-[var(--danger)]"
          )}
          aria-hidden
        />
        <span className="truncate text-[14px] font-semibold text-[var(--text)] min-[720px]:text-[16px]">{name}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{side === "radiant" ? "Radiant" : "Dire"}</p>
    </div>
  );
}

function PowerCompare({ radiant, dire }: { radiant: number; dire: number }) {
  const total = radiant + dire;
  if (total <= 0) return null;
  const left = Math.round((radiant / total) * 100);
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-[12px] text-[var(--text-3)]">
        <span>
          сила <span className="font-mono-num font-semibold text-[var(--power)]">{Math.round(radiant)}</span>
        </span>
        <span>
          <span className="font-mono-num font-semibold text-[var(--power)]">{Math.round(dire)}</span> сила
        </span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Сила команд: ${Math.round(radiant)} против ${Math.round(dire)}`}>
        <span className="rounded-l-full bg-[var(--power)]" style={{ width: `${left}%` }} />
        <span className="flex-1 rounded-r-full bg-[var(--power-border)]" />
      </div>
    </div>
  );
}

function MirrorLineup({
  radiant,
  dire,
  userMap,
  viewer,
  mvpId,
}: {
  radiant: LineupSlot[];
  dire: LineupSlot[];
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  mvpId?: string | null;
}) {
  const positions = [1, 2, 3, 4, 5];
  const byPos = (slots: LineupSlot[]) => Object.fromEntries(slots.map((s) => [s.position, s]));
  const r = byPos(radiant);
  const d = byPos(dire);
  const showPower = viewer.role === "ADMIN";

  const cell = (slot: LineupSlot | undefined, align: "left" | "right") => {
    if (!slot) return <span className="text-[13px] text-[var(--text-4)]">—</span>;
    const u = userMap[slot.userId];
    const me = slot.userId === viewer.id;
    const isMvp = Boolean(mvpId && slot.userId === mvpId);
    return (
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1",
          align === "right" && "flex-row-reverse text-right",
          me && "bg-[var(--points-bg)]"
        )}
      >
        <span className="min-w-0 truncate text-[13px] min-[720px]:text-[14px]">
          {u ? (
            <PlayerLink user={u} viewer={viewer} className={cn(me && "text-[var(--points-ink)]")}>
              {me ? "Ты" : undefined}
            </PlayerLink>
          ) : (
            slot.userId
          )}
        </span>
        {isMvp && <Star className="h-3.5 w-3.5 shrink-0 fill-[var(--warning)] text-[var(--warning)]" aria-label="MVP" />}
        {showPower && u?.profile && (
          <span className="shrink-0 font-mono-num text-[11px] text-[var(--power)]">{u.profile.finalRating}</span>
        )}
      </span>
    );
  };

  return (
    <div className="mt-4 rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-1.5">
      {positions.map((p) => (
        <div
          key={p}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-[var(--border-soft)] last:border-b-0"
        >
          {cell(r[p], "left")}
          <span
            className="flex w-14 flex-col items-center leading-none"
            title={POSITION_LABELS[p]}
          >
            <span className="font-mono-num text-[13px] font-bold text-[var(--text-2)]">{p}</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-3)]">
              {POSITION_LABELS[p]?.split("·")[1]?.trim()}
            </span>
          </span>
          {cell(d[p], "right")}
        </div>
      ))}
    </div>
  );
}

/* ---------- прошлые матчи: строка, раскрывается по тапу ---------- */

function PastMatchRow({
  session,
  number,
  userMap,
  viewer,
}: {
  session: SessionWithGames;
  number: number;
  userMap: Record<string, UserRow>;
  viewer: Viewer;
}) {
  const d = matchData(session, userMap, viewer);
  const hasGames = session.games.length > 0;
  const winner = !hasGames
    ? null
    : d.radiantWins > d.direWins
      ? { name: d.radiantName, side: "radiant" as const }
      : d.direWins > d.radiantWins
        ? { name: d.direName, side: "dire" as const }
        : { name: "Ничья", side: null };
  const myResult =
    d.myTeam && winner?.side
      ? (winner.side === "radiant") === (d.myTeam === "RADIANT")
        ? "W"
        : "L"
      : null;

  return (
    <details className="group">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-muted)] min-[720px]:px-6 [&::-webkit-details-marker]:hidden">
        <span className="w-9 shrink-0 font-mono-num text-[12px] text-[var(--text-3)]">#{number}</span>
        <span className="w-14 shrink-0 text-[13px] text-[var(--text-2)]">{formatShortDate(session.date)}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text)]">
          {winner ? winner.name : MATCH_STATUS_LABELS[session.status]}
        </span>
        {hasGames && (
          <span className="shrink-0 font-mono-num text-[14px] font-bold text-[var(--text)]">
            {d.radiantWins}:{d.direWins}
          </span>
        )}
        {myResult && (
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[11px] font-bold",
              myResult === "W"
                ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
                : "bg-[var(--danger-bg)] text-[var(--danger)]"
            )}
            title={myResult === "W" ? "Ты выиграл" : "Ты проиграл"}
          >
            {myResult}
          </span>
        )}
        <span
          className="shrink-0 text-[var(--text-3)] transition-transform duration-[200ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-90"
          aria-hidden
        >
          ›
        </span>
      </summary>
      <div className="border-t border-[var(--border-soft)] bg-[var(--surface)]">
        <MatchCard session={session} number={number} userMap={userMap} viewer={viewer} embedded />
      </div>
    </details>
  );
}

function sumPower(ids: string[], userMap: Record<string, UserRow>) {
  return ids.reduce((s, id) => s + (userMap[id]?.profile?.finalRating ?? 0), 0);
}

function sumPoints(participants: { userId: string; pointsAwarded: number }[], teamIds: string[]) {
  const set = new Set(teamIds);
  return participants.filter((p) => set.has(p.userId)).reduce((s, p) => s + p.pointsAwarded, 0);
}
