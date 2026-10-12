import { prisma } from "@/lib/db";
import { VideosClient } from "@/components/VideosClient";
import { getSessionUser } from "@/lib/session";
import type { ViewedMap } from "@/lib/materials";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Видео" };

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const user = await getSessionUser();

  const [videos, views] = await Promise.all([
    prisma.learningMaterial.findMany({
      where: { type: "VIDEO" },
      orderBy: { createdAt: "desc" },
    }),
    user
      ? prisma.materialView.findMany({
          where: { userId: user.id },
          select: { materialId: true, viewedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const initialViews: ViewedMap = Object.fromEntries(
    views.map((v) => [v.materialId, v.viewedAt.toISOString()])
  );

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link href="/materials" className="inline-flex items-center gap-0.5 hover:text-[var(--points-ink)]">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Материалы
          </Link>
        }
        title="Видеотека"
        description="Разборы и гайды, сгруппированные по позициям."
      />
      <VideosClient videos={videos} initialViews={initialViews} />
    </div>
  );
}
