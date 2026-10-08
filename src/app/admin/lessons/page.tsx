import { prisma } from "@/lib/db";
import { AdminLessonsClient, type LessonDto } from "@/components/AdminLessonsClient";

export const dynamic = "force-dynamic";

export default async function AdminLessonsPage() {
  const rows = await prisma.lessonArchive.findMany({
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
        <h1 className="text-3xl font-bold text-[var(--text)]">Архив занятий</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Добавляйте материалы и жмите «Открыть» — только тогда ученики увидят занятие.
        </p>
      </div>
      <AdminLessonsClient lessons={lessons} />
    </div>
  );
}
