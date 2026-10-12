import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/utils";
import { PlayerProfileView } from "@/components/profile/PlayerProfileView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, username: true },
  });
  return { title: user ? displayName(user) : "Игрок" };
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const viewer = await getSessionUser();

  return <PlayerProfileView userId={id} viewer={viewer} initialTab={tab} />;
}
