import { prisma } from "@/lib/db";
import { VideosClient } from "@/components/VideosClient";
import { getSessionUser } from "@/lib/session";
import type { ViewedMap } from "@/lib/materials";

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
      <h1 className="mb-6 text-3xl font-bold">Видео</h1>
      <VideosClient videos={videos} initialViews={initialViews} />
    </div>
  );
}
