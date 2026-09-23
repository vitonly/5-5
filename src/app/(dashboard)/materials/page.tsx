import { prisma } from "@/lib/db";
import { MaterialsClient } from "@/components/MaterialsClient";
import { getLiveStreamsFromMaterials } from "@/lib/materials-live";
import { getSessionUser } from "@/lib/session";
import type { ViewedMap } from "@/lib/materials";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const user = await getSessionUser();

  const [materials, live, views] = await Promise.all([
    prisma.learningMaterial.findMany({ orderBy: { createdAt: "desc" } }),
    getLiveStreamsFromMaterials(),
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
      <h1 className="mb-6 text-3xl font-bold">Обучающие материалы</h1>
      <MaterialsClient
        materials={materials}
        liveLogins={live.liveLogins}
        liveStreams={live.liveStreams}
        initialViews={initialViews}
      />
    </div>
  );
}
