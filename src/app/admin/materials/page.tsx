import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AdminMaterialsClient } from "@/components/AdminMaterialsClient";

export const metadata = { title: "Материалы · Админка" };

export default async function AdminMaterialsPage() {
  const materials = await prisma.learningMaterial.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader eyebrow="Панель тренера" title="Материалы" description="Видео, эфиры и статьи для ленты учеников." />
      <AdminMaterialsClient materials={materials} />
    </div>
  );
}
