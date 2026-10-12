import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AdminLessonsClient, type LessonDto } from "@/components/AdminLessonsClient";

export const metadata = { title: "Уроки · Админка" };

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
      <PageHeader
        eyebrow="Панель тренера"
        title="Архив занятий"
        description="Добавляйте материалы и жмите «Открыть» — только тогда ученики увидят занятие."
        className="mb-0 min-[720px]:mb-0"
      />
      <AdminLessonsClient lessons={lessons} />
    </div>
  );
}
