import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { MATCH_STATUS_LABELS } from "@/lib/labels";
import { formatDate, parseJsonArray } from "@/lib/utils";
import { PlayerLink } from "@/components/PlayerLink";
import { MatchNav } from "@/components/MatchNav";
import { PowerPill, PointsPill } from "@/components/StatPills";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  profile: { finalRating: number } | null;
};

export default async function MatchPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const sessions = await prisma.matchSession.findMany({
    include: {
      games: {
        include: { participants: true },
        orderBy: { gameNumber: "asc" },
      },
    },
    orderBy: { date: "desc" },
    take: 10,
  });

  const allIds = [
    ...new Set(
      sessions.flatMap((s) => [
        ...parseJsonArray(s.radiantPlayerIds),
        ...parseJsonArray(s.direPlayerIds),
      ])
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

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Субботние 5v5</h1>
      <MatchNav />

      {sessions.length === 0 ? (
        <p className="text-[var(--text-3)]">Матчи ещё не запланированы</p>
      ) : (
        <div className="space-y-5">
          {sessions.map((session, idx) => {
            const radiant = parseJsonArray(session.radiantPlayerIds);
            const dire = parseJsonArray(session.direPlayerIds);
            const myTeam = radiant.includes(user.id)
              ? "RADIANT"
              : dire.includes(user.id)
                ? "DIRE"
                : null;

            const radiantPower = sumPower(radiant, userMap);
            const direPower = sumPower(dire, userMap);

            const lastGame = session.games[session.games.length - 1];
            const radiantPoints = lastGame
              ? sumPoints(lastGame.participants, radiant)
              : 0;
            const direPoints = lastGame ? sumPoints(lastGame.participants, dire) : 0;

            const radiantWins = session.games.filter((g) => g.winnerTeam === "RADIANT").length;
            const direWins = session.games.filter((g) => g.winnerTeam === "DIRE").length;

            return (
              <article
                key={session.id}
                className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                      Матч #{sessions.length - idx}
                    </span>
                    <h2 className="text-base font-semibold text-[var(--text)]">
                      {formatDate(session.date)}
                    </h2>
                    {myTeam && (
                      <span className="text-sm text-[var(--points)]">
                        Ваша команда: {myTeam === "RADIANT" ? "Radiant" : "Dire"}
                      </span>
                    )}
                  </div>
                  <Badge>{MATCH_STATUS_LABELS[session.status]}</Badge>
                </div>

                {(radiant.length > 0 || dire.length > 0) && (
                  <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr]">
                    <TeamPanel
                      title="Radiant"
                      ids={radiant}
                      userMap={userMap}
                      viewer={user}
                      power={radiantPower}
                      points={radiantPoints}
                      showPoints={session.games.length > 0}
                      accent="radiant"
                    />

                    <div className="flex flex-col items-center justify-center gap-1 border-y border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 py-6 md:border-x md:border-y-0">
                      <span className="font-mono-num text-2xl font-bold tracking-wider text-[var(--text-3)]">
                        VS
                      </span>
                      {session.games.length > 0 && (
                        <span className="font-mono-num text-sm text-[var(--text)]">
                          {radiantWins} — {direWins}
                        </span>
                      )}
                    </div>

                    <TeamPanel
                      title="Dire"
                      ids={dire}
                      userMap={userMap}
                      viewer={user}
                      power={direPower}
                      points={direPoints}
                      showPoints={session.games.length > 0}
                      accent="dire"
                    />
                  </div>
                )}

                {session.games.length > 0 && (
                  <div className="border-t border-[var(--border-soft)] px-5 py-3 text-sm text-[var(--text-3)]">
                    Игры:{" "}
                    {session.games.map((g) => `Игра ${g.gameNumber}: ${g.winnerTeam}`).join(" · ")}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sumPower(ids: string[], userMap: Record<string, UserRow>) {
  return ids.reduce((s, id) => s + (userMap[id]?.profile?.finalRating ?? 0), 0);
}

function sumPoints(
  participants: { userId: string; pointsAwarded: number }[],
  teamIds: string[]
) {
  const set = new Set(teamIds);
  return participants
    .filter((p) => set.has(p.userId))
    .reduce((s, p) => s + p.pointsAwarded, 0);
}

function TeamPanel({
  title,
  ids,
  userMap,
  viewer,
  power,
  points,
  showPoints,
  accent,
}: {
  title: string;
  ids: string[];
  userMap: Record<string, UserRow>;
  viewer: { id: string; role: string };
  power: number;
  points: number;
  showPoints: boolean;
  accent: "radiant" | "dire";
}) {
  const showIndividualPower = viewer.role === "ADMIN";
  const border =
    accent === "radiant"
      ? "border-l-[3px] border-l-[var(--success)]"
      : "border-l-[3px] border-l-[var(--danger)] md:border-l-0 md:border-r-[3px] md:border-r-[var(--danger)]";

  return (
    <div className={`p-5 ${border}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[var(--text)]">{title}</p>
        <div className="flex flex-wrap items-center gap-2">
          {ids.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-3)]">
              сила
              <PowerPill value={power} />
            </span>
          )}
          {showPoints && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-3)]">
              очки
              <PointsPill value={points} />
            </span>
          )}
        </div>
      </div>
      {ids.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">Состав не задан</p>
      ) : (
        <ul className="space-y-2">
          {ids.map((id, i) => {
            const u = userMap[id];
            return (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--control)] font-mono-num text-[11px] text-[var(--text-2)]">
                    {i + 1}
                  </span>
                  {u ? <PlayerLink user={u} viewer={viewer} /> : id}
                </span>
                {showIndividualPower && u?.profile && (
                  <span className="font-mono-num text-[12px] text-[var(--power)]">
                    {u.profile.finalRating}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
