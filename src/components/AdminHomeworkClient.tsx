"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HomeworkMaterials } from "@/components/HomeworkMaterials";
import { HOMEWORK_STATUS_LABELS, MATERIAL_TYPE_LABELS } from "@/lib/labels";
import { displayName, formatDate, materialDisplayTitle, parseJsonArray } from "@/lib/utils";
import type {
  Homework,
  HomeworkAssignment,
  HomeworkSubmission,
  LearningMaterial,
  User,
} from "@prisma/client";

type Assignment = HomeworkAssignment & {
  student: User;
  submission: HomeworkSubmission | null;
  homework: Homework;
};

type HomeworkWithAssignments = Homework & { assignments: Assignment[] };
type Student = User;
type Tab = "create" | "review";

type ReviewInput = {
  feedback: string;
  revisionDeadline: string;
  excellent: boolean;
};

type PendingAssignment = Assignment & { homework: Homework };

function ReviewAssignmentCard({
  a,
  materials,
  input,
  onUpdate,
  onGrade,
  onRevision,
}: {
  a: PendingAssignment;
  materials: LearningMaterial[];
  input: ReviewInput | undefined;
  onUpdate: (patch: Partial<ReviewInput>) => void;
  onGrade: () => void;
  onRevision: () => void;
}) {
  const fileUrls = a.submission ? parseJsonArray(a.submission.fileUrls) : [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--border-soft)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{a.homework.title}</CardTitle>
          <Badge variant="warning">{HOMEWORK_STATUS_LABELS[a.status]}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-0 p-0">
        <section className="border-b border-[var(--border-soft)] bg-[var(--surface-muted)] px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--admin)]">Задание</p>
          <p className="text-xs text-[var(--text-4)]">Дедлайн: {formatDate(a.deadline)}</p>
          {a.homework.description && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
              {a.homework.description}
            </p>
          )}
          <div className="mt-3">
            <HomeworkMaterials materialIds={a.homework.materialIds} materials={materials} />
          </div>
        </section>

        {a.submission && (
          <>
            <section className="border-b border-[var(--border-soft)] bg-[var(--points-bg)] px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--points)]">
                  Ответ ученика
                </p>
                <p className="text-xs text-[var(--text-4)]">
                  Сдано: {formatDate(a.submission.submittedAt)}
                </p>
              </div>
              <div className="rounded-[var(--radius-control)] border border-[var(--points-border)] bg-[var(--surface)] p-4 text-sm">
                <p className="whitespace-pre-wrap leading-relaxed text-[var(--text)]">
                  {a.submission.textAnswer}
                </p>
                {fileUrls.length > 0 && (
                  <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
                    <p className="mb-2 text-xs font-medium text-[var(--text-3)]">Прикреплённые файлы</p>
                    <div className="flex flex-wrap gap-2">
                      {fileUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-[var(--radius-control)] border border-[var(--points-border)] bg-[var(--points-bg)] px-3 py-1.5 text-sm text-[var(--points)] underline-offset-2 hover:text-[var(--points-hover)] hover:underline"
                        >
                          {url.split("/").pop()}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin)]">
                Проверка
              </p>
              <div>
                <Label>Комментарий</Label>
                <Input
                  placeholder="Комментарий ученику"
                  value={input?.feedback ?? ""}
                  onChange={(e) => onUpdate({ feedback: e.target.value })}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-3">
                <input
                  type="checkbox"
                  checked={input?.excellent ?? false}
                  onChange={(e) => onUpdate({ excellent: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--border)]"
                />
                <div>
                  <p className="text-sm font-medium text-[var(--success)]">
                    Очень хорошо выполнена
                  </p>
                  <p className="text-xs text-[var(--text-3)]">
                    +1 очко вместо +0.5 за принятую домашку
                  </p>
                </div>
              </label>

              <Button onClick={onGrade}>Принять</Button>

              <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4">
                <p className="text-sm font-medium text-[var(--danger)]">Отправить на доработку</p>
                <div>
                  <Label>Дедлайн доработки</Label>
                  <Input
                    type="datetime-local"
                    value={input?.revisionDeadline ?? ""}
                    onChange={(e) => onUpdate({ revisionDeadline: e.target.value })}
                  />
                </div>
                <Button variant="secondary" onClick={onRevision}>
                  Отправить на доработку
                </Button>
              </div>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminHomeworkClient({
  homeworks: initial,
  students,
  materials,
}: {
  homeworks: HomeworkWithAssignments[];
  students: Student[];
  materials: LearningMaterial[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [reviewStudentId, setReviewStudentId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [createError, setCreateError] = useState("");

  const [gradeInputs, setGradeInputs] = useState<Record<string, ReviewInput>>({});
  const [expandedHomeworkIds, setExpandedHomeworkIds] = useState<Record<string, boolean>>({});

  const allStudentIds = students.map((s) => s.id);
  const allSelected =
    students.length > 0 && allStudentIds.every((id) => selectedStudents.includes(id));

  const pendingReview = initial.flatMap((hw) =>
    hw.assignments
      .filter((a) => a.status === "SUBMITTED" && a.submission)
      .map((a) => ({ ...a, homework: hw }))
  );

  const pendingByStudent = new Map<string, typeof pendingReview>();
  for (const a of pendingReview) {
    const list = pendingByStudent.get(a.studentId) ?? [];
    list.push(a);
    pendingByStudent.set(a.studentId, list);
  }

  const assignmentsByStudent = new Map<string, Assignment[]>();
  for (const hw of initial) {
    for (const a of hw.assignments) {
      const list = assignmentsByStudent.get(a.studentId) ?? [];
      list.push(a);
      assignmentsByStudent.set(a.studentId, list);
    }
  }

  const reviewStudent = reviewStudentId
    ? students.find((s) => s.id === reviewStudentId)
    : null;
  const reviewStudentPending = reviewStudentId
    ? (pendingByStudent.get(reviewStudentId) ?? [])
    : [];
  const reviewStudentAssignments = reviewStudentId
    ? (assignmentsByStudent.get(reviewStudentId) ?? [])
    : [];

  async function createHomework() {
    setCreateError("");
    const res = await fetch("/api/homework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        deadline,
        studentIds: selectedStudents,
        materialIds: selectedMaterials,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCreateError(data.error || "Не удалось создать домашку");
      return;
    }
    setTitle("");
    setDescription("");
    setDeadline("");
    setSelectedStudents([]);
    setSelectedMaterials([]);
    router.refresh();
  }

  async function grade(assignmentId: string) {
    const g = gradeInputs[assignmentId];
    await fetch("/api/homework", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId,
        excellent: g?.excellent ?? false,
        feedback: g?.feedback ?? "",
      }),
    });
    router.refresh();
  }

  async function sendRevision(assignmentId: string) {
    const g = gradeInputs[assignmentId];
    if (!g?.revisionDeadline) return;
    const res = await fetch("/api/homework", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "revision",
        assignmentId,
        feedback: g.feedback,
        revisionDeadline: g.revisionDeadline,
      }),
    });
    if (res.ok) router.refresh();
  }

  async function remind(assignmentId: string) {
    const res = await fetch("/api/homework/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId }),
    });
    const data = await res.json().catch(() => ({}));
    alert(
      data.delivered
        ? "Напоминание отправлено в Telegram!"
        : "Не удалось отправить: у ученика нет привязанного Telegram или он не запускал бота."
    );
  }

  function toggleStudent(id: string) {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function toggleAllStudents() {
    setSelectedStudents(allSelected ? [] : allStudentIds);
  }

  function toggleMaterial(id: string) {
    setSelectedMaterials((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  function updateReviewInput(assignmentId: string, patch: Partial<ReviewInput>) {
    setGradeInputs((prev) => {
      const current = prev[assignmentId] ?? {
        feedback: "",
        revisionDeadline: "",
        excellent: false,
      };
      return {
        ...prev,
        [assignmentId]: { ...current, ...patch },
      };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setTab("create");
            setReviewStudentId(null);
          }}
          className={`rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium ${
            tab === "create"
              ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
          }`}
        >
          Выдать задание
        </button>
        <button
          type="button"
          onClick={() => setTab("review")}
          className={`relative rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium ${
            tab === "review"
              ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
          }`}
        >
          Проверить работы
          {pendingReview.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
              {pendingReview.length > 9 ? "9+" : pendingReview.length}
            </span>
          )}
        </button>
      </div>

      {tab === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>Новая домашка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Название</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Дедлайн</Label>
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div>
              <Label>Материалы (необязательно)</Label>
              {materials.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-4)]">
                  Сначала добавьте материалы в разделе «Материалы».
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {materials.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMaterial(m.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        selectedMaterials.includes(m.id)
                          ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                      }`}
                    >
                      [{MATERIAL_TYPE_LABELS[m.type]}] {materialDisplayTitle(m)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Ученики</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleAllStudents}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    allSelected
                      ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                  }`}
                >
                  Все
                </button>
                {students.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selectedStudents.includes(s.id)
                        ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                    }`}
                  >
                    {displayName(s)}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={createHomework}
              disabled={!title || !description || !deadline || !selectedStudents.length}
            >
              Выдать задание
            </Button>
            {createError && <p className="text-sm text-[var(--danger)]">{createError}</p>}
          </CardContent>
        </Card>
      ) : reviewStudent && reviewStudentId ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setReviewStudentId(null)}>
            ← К списку учеников
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-[var(--text)]">{displayName(reviewStudent)}</h2>
            {reviewStudentPending.length > 0 && (
              <Badge variant="warning">{reviewStudentPending.length} на проверке</Badge>
            )}
          </div>

          {reviewStudentPending.length === 0 ? (
            <p className="text-[var(--text-3)]">Нет работ на проверке</p>
          ) : (
            reviewStudentPending.map((a) => (
              <ReviewAssignmentCard
                key={a.id}
                a={a}
                materials={materials}
                input={gradeInputs[a.id]}
                onUpdate={(patch) => updateReviewInput(a.id, patch)}
                onGrade={() => grade(a.id)}
                onRevision={() => sendRevision(a.id)}
              />
            ))
          )}

          {reviewStudentAssignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Все домашки ученика</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {reviewStudentAssignments.map((a) => {
                    const isOpen = Boolean(expandedHomeworkIds[a.id]);
                    const badgeVariant =
                      a.status === "GRADED"
                        ? "success"
                        : a.status === "OVERDUE"
                          ? "danger"
                          : a.status === "SUBMITTED" || a.status === "REVISION"
                            ? "warning"
                            : "default";
                    const rowTone =
                      a.status === "GRADED"
                        ? "border-[var(--success-border)] bg-[var(--success-bg)]"
                        : a.status === "OVERDUE"
                          ? "border-[var(--danger-border)] bg-[var(--danger-bg)]"
                          : "border-[var(--border)] bg-[var(--surface)]";

                    return (
                      <li
                        key={a.id}
                        className={`rounded-[var(--radius-control)] border ${rowTone}`}
                      >
                        <div className="flex flex-wrap items-center gap-2 p-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() =>
                              setExpandedHomeworkIds((prev) => ({
                                ...prev,
                                [a.id]: !prev[a.id],
                              }))
                            }
                          >
                            <span className="font-medium text-[var(--text)]">
                              {a.homework.title}
                            </span>
                            <span className="ml-2 text-xs text-[var(--text-4)]">
                              {isOpen ? "▾" : "▸"} подробнее
                            </span>
                          </button>
                          <Badge variant={badgeVariant}>
                            {HOMEWORK_STATUS_LABELS[a.status]}
                          </Badge>
                          {a.status !== "GRADED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => remind(a.id)}
                            >
                              Напомнить
                            </Button>
                          )}
                        </div>

                        {isOpen && (
                          <div className="space-y-3 border-t border-[var(--border-soft)] px-3 py-3 text-[var(--text-2)]">
                            <p className="text-xs text-[var(--text-4)]">
                              Дедлайн: {formatDate(a.deadline)}
                              {a.revisionDeadline && (
                                <>
                                  {" · "}
                                  Доработка до: {formatDate(a.revisionDeadline)}
                                </>
                              )}
                            </p>
                            {a.homework.description && (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
                                {a.homework.description}
                              </p>
                            )}
                            <HomeworkMaterials
                              materialIds={a.homework.materialIds}
                              materials={materials}
                            />
                            {a.revisionNote && (
                              <div className="rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
                                <p className="font-medium">Комментарий на доработку</p>
                                <p className="mt-1 whitespace-pre-wrap">{a.revisionNote}</p>
                              </div>
                            )}
                            {a.submission && (
                              <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                                <p className="mb-1 font-medium text-[var(--text)]">
                                  Ответ ученика
                                  {a.submission.submittedAt && (
                                    <span className="ml-2 font-normal text-xs text-[var(--text-4)]">
                                      {formatDate(a.submission.submittedAt)}
                                    </span>
                                  )}
                                </p>
                                <p className="whitespace-pre-wrap text-[var(--text)]">
                                  {a.submission.textAnswer}
                                </p>
                                {parseJsonArray(a.submission.fileUrls).length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {parseJsonArray(a.submission.fileUrls).map((url) => (
                                      <a
                                        key={url}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-[var(--points)] underline"
                                      >
                                        {url.split("/").pop()}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {a.submission.feedback && (
                                  <p className="mt-2 text-[var(--text-3)]">
                                    Комментарий: {a.submission.feedback}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {students.length === 0 ? (
            <p className="text-[var(--text-3)]">Нет учеников</p>
          ) : (
            students.map((s) => {
              const pending = pendingByStudent.get(s.id)?.length ?? 0;
              const total = assignmentsByStudent.get(s.id)?.length ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setReviewStudentId(s.id)}
                  className="flex w-full items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition hover:border-[var(--admin-border)] hover:bg-[var(--admin-bg)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[var(--text)]">{displayName(s)}</span>
                    {total > 0 && (
                      <span className="text-xs text-[var(--text-4)]">
                        {total} {total === 1 ? "задание" : total < 5 ? "задания" : "заданий"}
                      </span>
                    )}
                  </div>
                  {pending > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--danger)] px-2 text-xs font-bold text-white">
                      {pending}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
