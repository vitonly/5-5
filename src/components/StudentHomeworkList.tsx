"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, FileUp, MessageSquareWarning, Paperclip, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { HomeworkMaterials } from "@/components/HomeworkMaterials";
import { HOMEWORK_STATUS_LABELS } from "@/lib/labels";
import { POINT_VALUES, formatPoints } from "@/lib/points";
import { formatShortDateTime } from "@/lib/format";
import { cn, parseJsonArray } from "@/lib/utils";
import { usePasteImage } from "@/lib/use-paste-image";
import type { Homework, HomeworkAssignment, HomeworkSubmission, LearningMaterial } from "@prisma/client";

type AssignmentWithRelations = HomeworkAssignment & {
  homework: Homework;
  submission: HomeworkSubmission | null;
};

type TabKey = "active" | "reviewed" | "all";
type Tone = "points" | "warning" | "danger" | "success" | "default";

const ACTIVE_STATUSES = new Set(["ASSIGNED", "SUBMITTED", "REVISION", "OVERDUE"]);
const REVIEWED_STATUSES = new Set(["GRADED"]);

const STATUS_TONE: Record<string, Tone> = {
  ASSIGNED: "points",
  SUBMITTED: "warning",
  REVISION: "danger",
  OVERDUE: "danger",
  GRADED: "success",
};

const ACCENT: Record<Tone, string> = {
  points: "var(--points)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  success: "var(--success)",
  default: "var(--border)",
};

function needsAction(a: AssignmentWithRelations) {
  return (
    (["ASSIGNED", "OVERDUE"].includes(a.status) && !a.submission) || a.status === "REVISION"
  );
}

function deadlineOf(a: AssignmentWithRelations) {
  return a.status === "REVISION" && a.revisionDeadline ? a.revisionDeadline : a.deadline;
}

const HOUR = 3_600_000;

/** «осталось 5 ч», «осталось 2 дн», «просрочено 3 дн» + цвет */
function deadlineInfo(date: Date | string | number, now: number): { label: string; tone: Tone } {
  const diff = new Date(date).getTime() - now;
  if (diff < 0) {
    const d = Math.max(1, Math.floor(-diff / (24 * HOUR)));
    return { label: -diff < 24 * HOUR ? "просрочено" : `просрочено ${d} дн`, tone: "danger" };
  }
  const h = Math.floor(diff / HOUR);
  if (h < 1) return { label: "меньше часа", tone: "danger" };
  if (h < 24) return { label: `осталось ${h} ч`, tone: "danger" };
  const d = Math.floor(h / 24);
  if (d < 3) return { label: `осталось ${d} дн`, tone: "warning" };
  return { label: `осталось ${d} дн`, tone: "default" };
}

function earnedPoints(a: AssignmentWithRelations) {
  if (a.status !== "GRADED" || !a.submission) return 0;
  return a.submission.excellent ? POINT_VALUES.HOMEWORK_EXCELLENT : POINT_VALUES.HOMEWORK_DONE;
}

export function StudentHomeworkList({
  assignments,
  materials,
  now,
}: {
  assignments: AssignmentWithRelations[];
  materials: LearningMaterial[];
  /** время рендера на сервере — чтобы «осталось N дн» совпадало при гидрации */
  now: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("active");

  const summary = useMemo(() => {
    const todo = assignments.filter(needsAction);
    const upcoming = todo
      .map((a) => new Date(deadlineOf(a)).getTime())
      .filter((t) => t >= now)
      .sort((a, b) => a - b)[0];
    return {
      todo: todo.length,
      review: assignments.filter((a) => a.status === "SUBMITTED").length,
      next: upcoming ? deadlineInfo(upcoming, now) : null,
      earned: assignments.reduce((s, a) => s + earnedPoints(a), 0),
      active: assignments.filter((a) => ACTIVE_STATUSES.has(a.status)).length,
      reviewed: assignments.filter((a) => REVIEWED_STATUSES.has(a.status)).length,
    };
  }, [assignments, now]);

  const filtered = useMemo(() => {
    if (tab === "active") {
      const rank = (a: AssignmentWithRelations) =>
        a.status === "REVISION" ? 0 : needsAction(a) ? 1 : 2;
      return assignments
        .filter((a) => ACTIVE_STATUSES.has(a.status))
        .sort(
          (a, b) =>
            rank(a) - rank(b) ||
            new Date(deadlineOf(a)).getTime() - new Date(deadlineOf(b)).getTime()
        );
    }
    if (tab === "reviewed") {
      return assignments
        .filter((a) => REVIEWED_STATUSES.has(a.status))
        .sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime());
    }
    return assignments;
  }, [assignments, tab]);

  if (assignments.length === 0) {
    return (
      <div className="surface-card flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--points-bg)] text-[var(--points)]">
          <CalendarClock className="h-6 w-6" />
        </span>
        <p className="font-medium text-[var(--text)]">Домашних заданий пока нет</p>
        <p className="mt-1 text-sm text-[var(--text-3)]">Когда тренер выдаст задание, оно появится здесь.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 min-[720px]:grid-cols-4 min-[720px]:gap-3">
        <StatTile label="К сдаче" value={summary.todo} tone={summary.todo > 0 ? "points" : "default"} />
        <StatTile label="На проверке" value={summary.review} />
        <StatTile
          label="Ближайший дедлайн"
          value={summary.next ? summary.next.label.replace("осталось ", "") : "—"}
          tone={summary.next?.tone === "danger" ? "danger" : summary.next?.tone === "warning" ? "warning" : "default"}
        />
        <StatTile
          label="Заработано"
          value={`+${formatPoints(summary.earned)}`}
          hint="очков за домашки"
          tone="success"
        />
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        items={[
          { value: "active", label: "Активные", count: summary.active },
          { value: "reviewed", label: "Проверенные", count: summary.reviewed },
          { value: "all", label: "Все", count: assignments.length },
        ]}
      />

      {filtered.length === 0 ? (
        <p className="surface-card px-4 py-10 text-center text-sm text-[var(--text-3)]">
          {tab === "active" ? "Все задания сданы — отличная работа!" : "В этой вкладке пока пусто"}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <HomeworkCard
              key={a.id}
              assignment={a}
              materials={materials}
              now={now}
              onSubmitted={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const cls = {
    points: "text-[var(--points-ink)] bg-[var(--points-bg)]",
    warning: "text-[var(--warning-ink)] bg-[var(--warning-bg)]",
    danger: "text-[var(--danger)] bg-[var(--danger-bg)]",
    success: "text-[var(--success-ink)] bg-[var(--success-bg)]",
    default: "text-[var(--text-2)] bg-[var(--control)]",
  }[tone];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] font-medium", cls)}>
      {children}
    </span>
  );
}

function fileName(url: string) {
  return decodeURIComponent(url.split("/").pop() ?? url);
}

function HomeworkCard({
  assignment,
  materials,
  now,
  onSubmitted,
}: {
  assignment: AssignmentWithRelations;
  materials: LearningMaterial[];
  now: number;
  onSubmitted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = needsAction(assignment);
  const isRevision = assignment.status === "REVISION";
  const tone = STATUS_TONE[assignment.status] ?? "default";
  const [open, setOpen] = useState(canSubmit);

  const deadline = deadlineOf(assignment);
  const showCountdown = canSubmit || assignment.status === "OVERDUE";
  const dl = deadlineInfo(deadline, now);
  const earned = earnedPoints(assignment);
  const submissionFiles = assignment.submission ? parseJsonArray(assignment.submission.fileUrls) : [];

  async function uploadFile(file: File) {
    setError(null);
    const name = file.name.toLowerCase();
    const okExt = /\.(dem|mp4|png|jpg|jpeg|webp|pdf|txt|doc|docx)$/i.test(name);
    const isImage = file.type.startsWith("image/");
    if (!okExt && !isImage) {
      setError("Допустимы: dem, mp4, png, jpg, pdf и документы");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Максимум 10 МБ на файл");
      return;
    }
    setUploading(true);
    try {
      const { uploadAppFile } = await import("@/lib/upload-client");
      const data = await uploadAppFile(file);
      setFiles((prev) => [...prev, data.url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
    }
  }

  const onPasteUploaded = useCallback(async (url: string) => {
    setFiles((prev) => [...prev, url]);
    setError(null);
  }, []);

  const { onPaste, uploading: pasteUploading } = usePasteImage({
    onUploaded: onPasteUploaded,
    onError: (msg) => setError(msg),
    enabled: canSubmit && !uploading,
  });

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/homework", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: assignment.id, textAnswer: text, fileUrls: files }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Не удалось отправить");
      toast.error("Не удалось отправить работу");
      return;
    }
    setText("");
    setFiles([]);
    toast.success(isRevision ? "Доработка отправлена тренеру" : "Работа отправлена на проверку");
    onSubmitted();
  }

  const busy = uploading || pasteUploading;

  return (
    <article className="surface-card relative overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: ACCENT[tone] }} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left min-[720px]:px-5 min-[720px]:py-4"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={tone === "default" ? "default" : tone}>{HOMEWORK_STATUS_LABELS[assignment.status]}</Badge>
            {showCountdown ? (
              <Chip tone={dl.tone}>
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                {dl.label}
              </Chip>
            ) : (
              <span className="text-[12px] text-[var(--text-3)]">до {formatShortDateTime(deadline)}</span>
            )}
            <span
              className={cn(
                "text-[12px] font-semibold",
                earned > 0 ? "text-[var(--success-ink)]" : "text-[var(--points-ink)]"
              )}
            >
              {earned > 0 ? `+${formatPoints(earned)} очк.` : `до +${formatPoints(POINT_VALUES.HOMEWORK_EXCELLENT)} очк.`}
            </span>
          </div>
          <h3 className="text-[16px] font-semibold leading-snug text-[var(--text)] min-[720px]:text-[17px]">
            {assignment.homework.title}
          </h3>
          {showCountdown && (
            <p className="mt-0.5 text-[12px] text-[var(--text-3)]">
              {isRevision ? "Доработка до " : "Сдать до "}
              {formatShortDateTime(deadline)}
            </p>
          )}
        </div>
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-1 h-5 w-5 shrink-0 text-[var(--text-3)] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--border-soft)] px-4 pb-4 pt-3.5 min-[720px]:px-5 min-[720px]:pb-5">
          {assignment.homework.description && (
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text)]">
              {assignment.homework.description}
            </p>
          )}
          <HomeworkMaterials materialIds={assignment.homework.materialIds} materials={materials} />

          {isRevision && assignment.revisionNote && (
            <div className="flex gap-2.5 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
              <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-medium">Комментарий тренера</p>
                <p className="mt-1 whitespace-pre-wrap">{assignment.revisionNote}</p>
              </div>
            </div>
          )}

          {assignment.submission && (
            <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 text-sm">
              <p className="eyebrow mb-2">{isRevision ? "Предыдущий ответ" : "Ваш ответ"}</p>
              {assignment.submission.textAnswer && (
                <p className="whitespace-pre-wrap text-[var(--text)]">{assignment.submission.textAnswer}</p>
              )}
              {submissionFiles.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {submissionFiles.map((url) => (
                    <FileChip key={url} url={url} />
                  ))}
                </div>
              )}
              {assignment.status === "GRADED" && (
                <p className="mt-2.5 font-medium text-[var(--success-ink)]">
                  {assignment.submission.excellent ? "Отлично выполнена" : "Принята"} · +{formatPoints(earned)}
                </p>
              )}
              {assignment.submission.feedback && (
                <p className="mt-1.5 text-[var(--text-2)]">
                  <span className="text-[var(--text-3)]">Комментарий тренера: </span>
                  {assignment.submission.feedback}
                </p>
              )}
            </div>
          )}

          {canSubmit && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--text)]">
                {isRevision ? "Сдать доработку" : "Сдать работу"}
              </p>
              <Textarea
                placeholder="Ваш ответ… Фото можно вставить через Ctrl+V"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onPaste={onPaste}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-dashed px-3.5 py-3 transition-colors",
                  dragOver
                    ? "border-[var(--points)] bg-[var(--points-bg)]"
                    : "border-[var(--border-field)] bg-[var(--surface-muted)] hover:border-[var(--points-border)]"
                )}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".dem,.mp4,.png,.jpg,.jpeg,.webp,.pdf,.txt,.doc,.docx"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface)] text-[var(--points)] shadow-[var(--shadow-xs)]">
                  <FileUp className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)]">
                    {busy ? "Загрузка…" : "Прикрепить файл"}
                  </p>
                  <p className="text-[12px] text-[var(--text-3)]">dem, mp4, png, pdf · до 10 МБ</p>
                </div>
              </div>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {files.map((url) => (
                    <FileChip key={url} url={url} onRemove={() => setFiles((f) => f.filter((x) => x !== url))} />
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

              <Button
                onClick={submit}
                disabled={loading || !text.trim() || busy}
                className="w-full min-[720px]:w-auto"
              >
                {loading ? "Отправка…" : isRevision ? "Отправить доработку" : "Отправить на проверку"}
              </Button>
            </div>
          )}

          {!canSubmit && assignment.status === "OVERDUE" && !assignment.submission && (
            <p className="text-sm text-[var(--danger)]">Дедлайн прошёл. Штраф начислен.</p>
          )}
        </div>
      )}
    </article>
  );
}

function FileChip({ url, onRemove }: { url: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1 pl-2.5 pr-1.5 text-[12px]">
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-[var(--points-ink)] hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {fileName(url)}
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Убрать файл"
          className="rounded-full p-0.5 text-[var(--text-3)] hover:bg-[var(--control)] hover:text-[var(--text)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
