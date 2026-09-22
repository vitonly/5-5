import { prisma } from "@/lib/db";
import { AdminMaterialsClient } from "@/components/AdminMaterialsClient";

export default async function AdminMaterialsPage() {
  const materials = await prisma.learningMaterial.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Обучающие материалы</h1>
      <AdminMaterialsClient materials={materials} />
    </div>
  );
}
