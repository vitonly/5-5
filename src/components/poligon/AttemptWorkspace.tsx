"use client";

/*
 * Рабочее место попытки: таймер, загрузка файлов, комментарий тренеру, кнопка «Сдать».
 * Файлы сохраняются в попытку сразу после загрузки — если закрыть вкладку, ничего не пропадёт.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadAppFile } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import type { AttemptFile } from "@/lib/poligon/core";
import type { Deliverable, WorkbookId } from "@/lib/poligon/types";
import type { Workbook } from "@/lib/poligon/a-practicum";
import { WorkbookView } from "./workbooks/WorkbookView";

/** Секунды → «1:05:09» */
function clock(totalSec: number) {
  const s = Math.abs(Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function AttemptWorkspace({
  attemptId,
  championship,
  deadlineAt,
  graceMin,
  initialFiles,
  initialText,
  deliverables,
  workbook,
  initialWorkbook,
}: {
  attemptId: string;
  championship: boolean;
  deadlineAt: string;
  graceMin: number;
  initialFiles: AttemptFile[];
  initialText: string;
  deliverables: Deliverable[];
  /** Тетрадь-практикум варианта (если есть) */
  workbook?: WorkbookId;
  initialWorkbook?: Workbook;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [text, setText] = useState(initialText);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Время считаем только в браузере, чтобы сервер и браузер не спорили о секундах
  const [now, setNow] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Тетрадь сохраняем не на каждую букву, а через 1,5 секунды после последнего изменения
  const wbRef = useRef<Workbook>(initialWorkbook ?? {});
  const wbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Первое значение — через 0 мс, дальше раз в секунду
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const deadline = new Date(deadlineAt).getTime();
  const left = now === null ? null : (deadline - now) / 1000;
  const closed = championship && left !== null && left < -graceMin * 60;

  async function save(next: { files?: AttemptFile[]; textAnswer?: string; workbook?: Workbook; submit?: boolean }) {
    const res = await fetch(`/api/poligon/attempts/${attemptId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string };
    if (!res?.ok) {
      toast.error(data?.error ?? "Не получилось сохранить. Проверь интернет.");
      return false;
    }
    return true;
  }

  const onWorkbook = useCallback(
    (w: Workbook) => {
      wbRef.current = w;
      if (wbTimer.current) clearTimeout(wbTimer.current);
      wbTimer.current = setTimeout(() => {
        fetch(`/api/poligon/attempts/${attemptId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workbook: w }),
        }).catch(() => toast.error("Тетрадь не сохранилась — проверь интернет"));
      }, 1500);
    },
    [attemptId]
  );

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    let next = files;
    for (const file of Array.from(list)) {
      setUploading(file.name);
      try {
        const { url } = await uploadAppFile(file);
        next = [...next, { name: file.name, url }];
        setFiles(next);
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "ошибка загрузки"}`);
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    if (await save({ files: next })) toast.success("Файлы сохранены");
  }

  async function remove(url: string) {
    const next = files.filter((f) => f.url !== url);
    setFiles(next);
    await save({ files: next });
  }

  async function submit() {
    if (!files.length && !workbook) return toast.error("Сначала загрузи файлы");
    if (wbTimer.current) clearTimeout(wbTimer.current);
    const ok = await confirmAction("Сдать работу на проверку? После этого файлы поменять нельзя.", {
      confirmLabel: "Сдать",
    });
    if (!ok) return;
    setBusy(true);
    const done = await save({ files, textAnswer: text, submit: true, ...(workbook ? { workbook: wbRef.current } : {}) });
    setBusy(false);
    if (done) {
      toast.success("Сдано! Тренер получил уведомление.");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Таймер */}
      <div
        className={cn(
          "surface-card sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          left !== null && left < 0 && "border-[var(--danger-border)]",
          left !== null && left >= 0 && left < 15 * 60 && "border-[var(--warning-border)]"
        )}
      >
        <div>
          <p className="text-[12px] font-medium text-[var(--text-3)]">
            {championship ? "Жёсткий таймер — как на чемпионате" : "Мягкий таймер — тренировка"}
          </p>
          <p
            className={cn(
              "font-mono-num text-[28px] font-bold leading-tight",
              left !== null && left < 0 ? "text-[var(--danger)]" : "text-[var(--text)]"
            )}
          >
            {left === null ? "…" : left >= 0 ? clock(left) : `+${clock(-left)}`}
          </p>
        </div>
        <p className="max-w-[44ch] text-[13px] text-[var(--text-2)]">
          {left === null
            ? ""
            : left >= 0
              ? left < 15 * 60
                ? "Меньше 15 минут! Сохрани файлы и загрузи их сюда."
                : "Делай перерыв раз в час. Файлы можно загружать по ходу работы."
              : championship
                ? closed
                  ? "Время вышло. Сдать уже нельзя — как на площадке."
                  : `Время вышло! Есть ${graceMin} мин, чтобы загрузить файлы и нажать «Сдать».`
                : "Время вышло. Можно сдать — опоздание будет отмечено в отчёте."}
        </p>
      </div>

      {workbook && !closed && <WorkbookView id={workbook} initial={initialWorkbook ?? {}} onChange={onWorkbook} />}

      {/* Что сдать */}
      <section className="surface-card p-4">
        <h2 className="mb-2 text-[17px]">{workbook ? "Файлы (если делал что-то в Word или PowerPoint)" : "Загрузи результат"}</h2>
        <ul className="mb-3 flex list-disc flex-col gap-0.5 pl-5 text-[14px] text-[var(--text-2)]">
          {deliverables.map((d) => (
            <li key={d.name}>
              {d.name} ({d.formats})
            </li>
          ))}
        </ul>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".xlsx,.xls,.csv,.ods,.docx,.doc,.pdf,.pptx,.ppt,.odt,.odp,.txt,.png,.jpg,.jpeg,.mp4,.mov,.webm"
          onChange={(e) => onPick(e.target.files)}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={!!uploading || closed}>
          {uploading ? `Загружаю ${uploading}…` : "Выбрать файлы"}
        </Button>
        <p className="mt-1.5 text-[12px] text-[var(--text-3)]">Документы и таблицы — до 64 МБ, видео — до 300 МБ.</p>

        {files.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {files.map((f) => (
              <li
                key={f.url}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-[14px]"
              >
                <a href={f.url} className="min-w-0 truncate text-[var(--text)] underline" download>
                  {f.name}
                </a>
                <Button variant="ghost" size="sm" onClick={() => remove(f.url)} disabled={closed}>
                  Убрать
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Комментарий */}
      <section className="surface-card p-4">
        <h2 className="mb-2 text-[17px]">Комментарий тренеру (необязательно)</h2>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => save({ textAnswer: text })}
          rows={4}
          placeholder="Что не успел, где сомневаешься, какие ловушки нашёл…"
          disabled={closed}
        />
      </section>

      <div>
        <Button size="lg" onClick={submit} disabled={busy || closed || (!files.length && !workbook)}>
          {busy ? "Сдаю…" : "Сдать на проверку"}
        </Button>
      </div>
    </div>
  );
}
