import { prisma } from "@/lib/db";
import { LessonsArchiveClient } from "@/components/LessonsArchiveClient";
import type { LessonDto } from "@/components/AdminLessonsClient";

export const metadata = { title: "Уроки" };

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  const rows = await prisma.lessonArchive.findMany({
    where: { isOpen: true },
    orderBy: { createdAt: "desc" },
    include: { files: { orderBy: { createdAt: "asc" } } },
  });

  const lessons: LessonDto[] = rows.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    isOpen: l.isOpen,
    createdAt: l.createdAt.toISOString(),
    files: l.files.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[var(--text)]">Архив занятий</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Материалы занятий, которые открыл тренер
        </p>
      </div>
      <LessonsArchiveClient lessons={lessons} />
    </div>
  );
}
