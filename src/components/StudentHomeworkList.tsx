"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HomeworkMaterials } from "@/components/HomeworkMaterials";
import { HOMEWORK_STATUS_LABELS } from "@/lib/labels";
import { POINT_VALUES, formatPoints } from "@/lib/points";
import { formatDate, parseJsonArray } from "@/lib/utils";
import type { Homework, HomeworkAssignment, HomeworkSubmission, LearningMaterial } from "@prisma/client";

type AssignmentWithRelations = HomeworkAssignment & {
  homework: Homework;
  submission: HomeworkSubmission | null;
};

type TabKey = "active" | "reviewed" | "all";

const ACTIVE_STATUSES = new Set(["ASSIGNED", "SUBMITTED", "REVISION", "OVERDUE"]);
const REVIEWED_STATUSES = new Set(["GRADED"]);

export function StudentHomeworkList({
  assignments,
  materials,
}: {
  assignments: AssignmentWithRelations[];
  materials: LearningMaterial[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("active");

  const counts = useMemo(() => {
    const active = assignments.filter((a) => ACTIVE_STATUSES.has(a.status)).length;
    const reviewed = assignments.filter((a) => REVIEWED_STATUSES.has(a.status)).length;
    return { active, reviewed, all: assignments.length };
  }, [assignments]);

  const filtered = useMemo(() => {
    if (tab === "active") return assignments.filter((a) => ACTIVE_STATUSES.has(a.status));
    if (tab === "reviewed") return assignments.filter((a) => REVIEWED_STATUSES.has(a.status));
    return assignments;
  }, [assignments, tab]);

  if (assignments.length === 0) {
    return <p className="text-[var(--text-3)]">Домашних заданий пока нет</p>;
  }

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "active", label: "Активные", count: counts.active },
    { key: "reviewed", label: "Проверенные", count: counts.reviewed },
    { key: "all", label: "Все", count: counts.all },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-[6px] px-3 py-2.5 text-center text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-[var(--points-bg)] text-[var(--points)]"
                : "text-[var(--text-2)] hover:bg-[var(--control)]"
            }`}
          >
            {t.label}
            <span className="ml-1.5 font-mono-num text-[12px] opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-[var(--text-3)]">В этой вкладке пока пусто</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((a) => (
            <HomeworkCard
              key={a.id}
              assignment={a}
              materials={materials}
              onSubmitted={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkCard({
  assignment,
  materials,
  onSubmitted,
}: {
  assignment: AssignmentWithRelations;
  materials: LearningMaterial[];
  onSubmitted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusVariant =
    assignment.status === "GRADED"
      ? "success"
      : assignment.status === "OVERDUE"
        ? "danger"
        : assignment.status === "SUBMITTED"
          ? "warning"
          : assignment.status === "REVISION"
            ? "warning"
            : "default";

  const canSubmit =
    (["ASSIGNED", "OVERDUE"].includes(assignment.status) && !assignment.submission) ||
    assignment.status === "REVISION";

  const isRevision = assignment.status === "REVISION";

  const pointsHint =
    assignment.status === "GRADED" && assignment.submission
      ? assignment.submission.excellent
        ? `+${formatPoints(POINT_VALUES.HOMEWORK_EXCELLENT)}`
        : `+${formatPoints(POINT_VALUES.HOMEWORK_DONE)}`
      : `до +${formatPoints(POINT_VALUES.HOMEWORK_EXCELLENT)}`;

  async function uploadFile(file: File) {
    setError(null);
    const name = file.name.toLowerCase();
    const okExt = /\.(dem|mp4|png|jpg|jpeg|webp|pdf|txt|doc|docx)$/i.test(name);
    if (!okExt) {
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
      return;
    }
    setText("");
    setFiles([]);
    onSubmitted();
  }

  return (
    <Card className={isRevision ? "border-[var(--danger-border)] border-l-[3px] border-l-[var(--danger)]" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{assignment.homework.title}</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              {isRevision && assignment.revisionDeadline
                ? `Дедлайн доработки: ${formatDate(assignment.revisionDeadline)}`
                : `Дедлайн: ${formatDate(assignment.deadline)}`}
              <span className="mx-2 text-[var(--border)]">·</span>
              <span className="font-mono-num text-[var(--points)]">{pointsHint}</span>
            </p>
          </div>
          <Badge variant={statusVariant}>{HOMEWORK_STATUS_LABELS[assignment.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{assignment.homework.description}</p>
        <HomeworkMaterials materialIds={assignment.homework.materialIds} materials={materials} />

        {isRevision && assignment.revisionNote && (
          <div className="rounded-[var(--radius-control)] border border-[var(--danger-border)] border-l-[3px] border-l-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
            <p className="font-medium">Комментарий тренера</p>
            <p className="mt-1 whitespace-pre-wrap">{assignment.revisionNote}</p>
          </div>
        )}

        {assignment.submission && (
          <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
            <p className="mb-2 font-medium text-[var(--text)]">
              {isRevision ? "Предыдущий ответ" : "Ваш ответ"}
            </p>
            <p className="whitespace-pre-wrap text-[var(--text)]">{assignment.submission.textAnswer}</p>
            {parseJsonArray(assignment.submission.fileUrls).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {parseJsonArray(assignment.submission.fileUrls).map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--points)] underline hover:text-[var(--points-hover)]"
                  >
                    {url.split("/").pop()}
                  </a>
                ))}
              </div>
            )}
            {assignment.submission.excellent && (
              <p className="mt-2 text-[var(--success)]">
                Отлично выполнена (+{formatPoints(POINT_VALUES.HOMEWORK_EXCELLENT)})
              </p>
            )}
            {!assignment.submission.excellent && assignment.status === "GRADED" && (
              <p className="mt-2 text-[var(--success)]">
                Принята (+{formatPoints(POINT_VALUES.HOMEWORK_DONE)})
              </p>
            )}
            {assignment.submission.feedback && (
              <p className="mt-1 text-[var(--text-3)]">Комментарий: {assignment.submission.feedback}</p>
            )}
          </div>
        )}

        {canSubmit && (
          <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-sm font-medium text-[var(--text)]">
              {isRevision ? "Сдать доработку" : "Сдать работу"}
            </p>
            <Textarea
              placeholder="Ваш ответ..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-control)] border border-dashed px-4 py-6 text-center transition-colors ${
                dragOver
                  ? "border-[var(--points)] bg-[var(--points-bg)]"
                  : "border-[var(--border)] bg-[var(--surface-muted)] hover:border-[var(--points-border)]"
              }`}
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
              <p className="text-sm text-[var(--text)]">
                {uploading ? "Загрузка..." : "Перетащите файл сюда или нажмите"}
              </p>
              <p className="mt-1 font-mono-num text-[11px] text-[var(--text-4)]">
                dem, mp4, png · до 10 МБ
              </p>
            </div>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--points)] underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {url.split("/").pop()}
                  </a>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

            <Button onClick={submit} disabled={loading || !text.trim() || uploading}>
              {loading
                ? "Отправка..."
                : isRevision
                  ? "Отправить доработку"
                  : "Отправить на проверку"}
            </Button>
          </div>
        )}

        {!canSubmit && assignment.status === "OVERDUE" && !assignment.submission && (
          <p className="text-[var(--danger)]">Дедлайн прошёл. Штраф начислен.</p>
        )}
      </CardContent>
    </Card>
  );
}
