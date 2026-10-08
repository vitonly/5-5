"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { LessonDto } from "@/components/AdminLessonsClient";

function fileLabel(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ppt", "pptx", "odp"].includes(ext)) return "Презентация";
  if (["doc", "docx", "odt"].includes(ext)) return "Word";
  if (ext === "pdf") return "PDF";
  return "Файл";
}

export function LessonsArchiveClient({ lessons }: { lessons: LessonDto[] }) {
  if (lessons.length === 0) {
    return (
      <p className="text-sm text-[var(--text-3)]">
        Пока нет открытых занятий. Когда тренер откроет урок — он появится здесь.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {lessons.map((lesson) => (
        <Card key={lesson.id}>
          <CardContent className="space-y-2 p-4">
            <div>
              <p className="font-semibold text-[var(--text)]">{lesson.title}</p>
              <p className="font-mono-num text-xs text-[var(--text-4)]">
                {formatDate(lesson.createdAt)}
              </p>
            </div>
            {lesson.description && (
              <p className="text-sm text-[var(--text-2)] whitespace-pre-wrap">
                {lesson.description}
              </p>
            )}
            {lesson.files.length > 0 ? (
              <ul className="space-y-1.5 pt-1">
                {lesson.files.map((f) => (
                  <li key={f.id ?? f.url}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-[var(--points)] hover:underline"
                    >
                      <span className="rounded border border-[var(--border)] bg-[var(--control)] px-1.5 py-0.5 text-[10px] text-[var(--text-2)]">
                        {fileLabel(f.name)}
                      </span>
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--text-4)]">Файлов нет</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
