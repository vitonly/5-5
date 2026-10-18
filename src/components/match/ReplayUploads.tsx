"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileVideo, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { formatDuration } from "@/lib/replay";

export type ReplaySummary = {
  gameNumber: number;
  durationSec: number;
  radiantScore: number;
  direScore: number;
  matched: number;
  total: number;
  unmatched: string[];
};

type Phase = { game: number; kind: "upload"; pct: number } | { game: number; kind: "parse" } | null;

/** Загрузка демок по играм сессии: прогресс загрузки → разбор на сервере → таблица на странице 5×5 */
export function ReplayUploads({
  sessionId,
  games,
  replays,
}: {
  sessionId: string;
  games: number[];
  replays: ReplaySummary[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>(null);

  const byGame = new Map(replays.map((r) => [r.gameNumber, r]));
  const busy = phase !== null;

  function pick(game: number) {
    setTarget(game);
    inputRef.current?.click();
  }

  function upload(file: File, game: number) {
    if (!/\.dem(\.bz2|\.gz|\.zst)?$/i.test(file.name)) {
      toast.error("Нужен файл демки .dem (или .dem.bz2 / .zst с OpenDota/Dotabuff)");
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/matches/replay?sessionId=${encodeURIComponent(sessionId)}&gameNumber=${game}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPhase({ game, kind: "upload", pct: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.upload.onload = () => setPhase({ game, kind: "parse" });
    xhr.onload = () => {
      setPhase(null);
      let data: { error?: string; matched?: number; total?: number; unmatched?: string[] } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success(`Демка игры ${game} разобрана · игроков найдено ${data.matched ?? 0}/${data.total ?? 10}`);
        router.refresh();
      } else if (xhr.status === 413) {
        toast.error("Файл слишком большой для сервера — поднимите client_max_body_size в nginx");
      } else {
        toast.error(data.error || "Не удалось загрузить демку");
      }
    };
    xhr.onerror = () => {
      setPhase(null);
      toast.error("Ошибка сети при загрузке демки");
    };
    setPhase({ game, kind: "upload", pct: 0 });
    xhr.send(file);
  }

  async function remove(game: number) {
    if (!(await confirmAction(`Удалить статистику игры ${game}?`))) return;
    const res = await fetch(`/api/matches/replay?sessionId=${encodeURIComponent(sessionId)}&gameNumber=${game}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Статистика удалена");
      router.refresh();
    } else toast.error("Не удалось удалить");
  }

  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <FileVideo className="h-4 w-4 text-[var(--admin)]" aria-hidden />
        <p className="text-sm font-semibold text-[var(--text)]">Демки игр</p>
        <span className="text-[12px] text-[var(--text-3)]">герои, K/D/A, нетворс и предметы появятся на странице 5×5</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".dem,.bz2,.gz,.zst"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f && target != null) upload(f, target);
        }}
      />
      <ul className="space-y-1.5">
        {games.map((g) => {
          const r = byGame.get(g);
          const active = phase?.game === g ? phase : null;
          return (
            <li key={g} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2 text-sm">
              <span className="w-16 shrink-0 font-medium">Игра {g}</span>
              <span className="min-w-0 flex-1 text-[13px]">
                {active ? (
                  active.kind === "upload" ? (
                    <span className="flex items-center gap-2 text-[var(--text-2)]">
                      Загрузка {active.pct}%
                      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--control)]">
                        <span className="block h-full bg-[var(--admin)]" style={{ width: `${active.pct}%` }} />
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[var(--text-2)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Разбираю демку… (до минуты)
                    </span>
                  )
                ) : r ? (
                  <span className="flex flex-wrap items-center gap-x-2 text-[var(--success-ink)]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="font-mono-num">
                      {r.radiantScore}:{r.direScore}
                      {r.durationSec > 0 && ` · ${formatDuration(r.durationSec)}`}
                    </span>
                    <span className={r.matched < r.total ? "text-[var(--warning-ink)]" : "text-[var(--text-3)]"}>
                      учеников найдено {r.matched}/{r.total}
                    </span>
                    {r.unmatched.length > 0 && (
                      <span className="w-full text-[12px] text-[var(--text-3)]">
                        Без Steam ID в профиле: {r.unmatched.join(", ")}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-[var(--text-3)]">не загружена</span>
                )}
              </span>
              {!active && (
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" variant={r ? "ghost" : "admin"} disabled={busy} onClick={() => pick(g)}>
                    <Upload aria-hidden />
                    {r ? "Заменить" : "Загрузить .dem"}
                  </Button>
                  {r && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label="Удалить статистику"
                      className="px-2 text-[var(--text-3)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                      onClick={() => remove(g)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
