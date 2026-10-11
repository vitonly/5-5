import { prisma } from "@/lib/db";
import { MaterialsClient } from "@/components/MaterialsClient";
import { getSessionUser } from "@/lib/session";
import type { ViewedMap } from "@/lib/materials";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const user = await getSessionUser();

  // Live-статус грузится на клиенте — иначе SSR ждёт Twitch 3–8с (белый экран)
  const [materials, views] = await Promise.all([
    prisma.learningMaterial.findMany({ orderBy: { createdAt: "desc" } }),
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
      <h1 className="mb-6">Обучающие материалы</h1>
      <MaterialsClient
        materials={materials}
        liveLogins={[]}
        liveStreams={[]}
        initialViews={initialViews}
      />
    </div>
  );
}
