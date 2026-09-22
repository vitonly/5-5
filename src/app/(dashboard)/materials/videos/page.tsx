import { prisma } from "@/lib/db";
import { VideosClient } from "@/components/VideosClient";

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const videos = await prisma.learningMaterial.findMany({
    where: { type: "VIDEO" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Видео</h1>
      <VideosClient videos={videos} />
    </div>
  );
}
