"use client";

import { confirmAction } from "@/components/ui/confirm";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Eye, EyeOff, Paperclip, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { uploadAppFile } from "@/lib/upload-client";
import { formatDate } from "@/lib/utils";

export type LessonFileDto = {
  id?: string;
  name: string;
  url: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type LessonDto = {
  id: string;
  title: string;
  description: string;
  isOpen: boolean;
  createdAt: string;
  files: LessonFileDto[];
};

const ACCEPT =
  ".ppt,.pptx,.doc,.docx,.pdf,.odt,.odp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

function fileLabel(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ppt", "pptx", "odp"].includes(ext)) return "Презентация";
  if (["doc", "docx", "odt"].includes(ext)) return "Word";
  if (ext === "pdf") return "PDF";
  return "Файл";
}

export function AdminLessonsClient({ lessons }: { lessons: LessonDto[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<LessonFileDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setIsOpen(false);
    setFiles([]);
    setError("");
  }

  function startEdit(lesson: LessonDto) {
    setFormOpen(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    setEditingId(lesson.id);
    setTitle(lesson.title);
    setDescription(lesson.description ?? "");
    setIsOpen(Boolean(lesson.isOpen));
    setFiles(lesson.files.map((f) => ({ ...f })));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setError("");
    try {
      const uploaded: LessonFileDto[] = [];
      for (const file of Array.from(list)) {
        const { url } = await uploadAppFile(file);
        uploaded.push({
          name: file.name,
          url,
          mimeType: file.type || null,
          sizeBytes: file.size,
        });
      }
      setFiles((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки файла");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/lessons", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          title,
          description,
          isOpen,
          files,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function toggleOpen(lesson: LessonDto) {
    setError("");
    const res = await fetch("/api/lessons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: lesson.id,
        action: "setOpen",
        isOpen: !lesson.isOpen,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось сменить доступ");
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    if (!(await confirmAction("Удалить занятие из архива?"))) return;
    const res = await fetch(`/api/lessons?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось удалить");
      return;
    }
    if (editingId === id) resetForm();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <CollapsibleCard
        variant="create"
        title={editingId ? "Редактировать занятие" : "Добавить занятие"}
        description="Презентации, документы и файлы к занятию"
        open={formOpen || Boolean(editingId)}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) resetForm();
        }}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lesson-title">Название</Label>
            <Input
              id="lesson-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Лейнинг на миде · занятие 3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lesson-desc">Краткое описание</Label>
            <Textarea
              id="lesson-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="О чём занятие, что разобрали…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={isOpen}
              onChange={(e) => setIsOpen(e.target.checked)}
            />
            Открыто для учеников
          </label>
          <div className="space-y-2">
            <Label>Файлы (pptx, docx, pdf… до 64 МБ)</Label>
            <input
              type="file"
              multiple
              accept={ACCEPT}
              disabled={uploading || saving}
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = "";
              }}
              className="block w-full text-sm text-[var(--text-2)] file:mr-3 file:rounded file:border-0 file:bg-[var(--points)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
            />
            {uploading && (
              <p className="text-xs text-[var(--text-3)]">Загрузка файла…</p>
            )}
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.url}-${i}`}
                    className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
                  >
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate text-[var(--points)] hover:underline"
                    >
                      {fileLabel(f.name)} · {f.name}
                    </a>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-xs text-[var(--danger)]"
                    >
                      Убрать
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving || uploading || !title.trim()}>
              {saving ? "Сохранение…" : editingId ? "Сохранить" : "Добавить в архив"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Отмена
              </Button>
            )}
          </div>
        </div>
      </CollapsibleCard>

      <div className="space-y-3">
        <h2 className="flex items-baseline gap-2 text-[17px] min-[720px]:text-[20px]">
          В архиве <span className="font-mono-num text-[13px] font-normal text-[var(--text-3)]">{lessons.length}</span>
        </h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">Пока пусто — добавьте первое занятие выше.</p>
        ) : (
          lessons.map((lesson) => (
            <Card key={lesson.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--text)]">{lesson.title}</p>
                      <Badge variant={lesson.isOpen ? "success" : "default"} className="h-5 px-2 text-[11px]">
                        {lesson.isOpen ? "Видно ученикам" : "Скрыто"}
                      </Badge>
                    </div>
                    <p className="font-mono-num text-xs text-[var(--text-3)]">
                      {formatDate(lesson.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={lesson.isOpen ? "outline" : "admin"}
                      size="sm"
                      onClick={() => void toggleOpen(lesson)}
                    >
                      {lesson.isOpen ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                      {lesson.isOpen ? "Скрыть" : "Открыть"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(lesson)}>
                      <Pencil aria-hidden />
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(lesson.id)}
                      aria-label="Удалить"
                      className="px-2 text-[var(--text-3)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
                {lesson.description && (
                  <p className="text-sm text-[var(--text-2)] whitespace-pre-wrap">
                    {lesson.description}
                  </p>
                )}
                {lesson.files.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {lesson.files.map((f) => (
                      <li key={f.id ?? f.url}>
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[12px] text-[var(--text)] hover:border-[var(--admin-border)]"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
                          <span className="font-semibold text-[var(--admin-ink)]">{fileLabel(f.name)}</span>
                          <span className="truncate">{f.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
