import { prisma } from "@/lib/db";
import { AdminMaterialsClient } from "@/components/AdminMaterialsClient";

export default async function AdminMaterialsPage() {
  const materials = await prisma.learningMaterial.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-6">Обучающие материалы</h1>
      <AdminMaterialsClient materials={materials} />
    </div>
  );
}
