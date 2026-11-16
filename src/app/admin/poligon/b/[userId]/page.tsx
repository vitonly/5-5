import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { BProgress } from "@/components/poligon/BProgress";
import { PageHeader } from "@/components/ui/page-header";
export const dynamic = "force-dynamic";
export default async function BStudentPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdmin();
  const { userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true } });
  if (!user) notFound();
  const attempts = await prisma.poligonAttempt.findMany({ where: { userId, moduleCode: "b" }, orderBy: { createdAt: "desc" }, take: 100 });
  return <><PageHeader title={`Модуль Б · ${user.firstName}`} description="Последние 100 работ: самостоятельные действия, разные варианты и повторяющиеся ошибки." /><BProgress attempts={attempts} admin /></>;
}
