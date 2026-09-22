import { prisma } from "@/lib/db";
import { MaterialsClient } from "@/components/MaterialsClient";
import { getLiveStreamsFromMaterials } from "@/lib/materials-live";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const [materials, live] = await Promise.all([
    prisma.learningMaterial.findMany({ orderBy: { createdAt: "desc" } }),
    getLiveStreamsFromMaterials(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Обучающие материалы</h1>
      <MaterialsClient
        materials={materials}
        liveLogins={live.liveLogins}
        liveStreams={live.liveStreams}
      />
    </div>
  );
}
