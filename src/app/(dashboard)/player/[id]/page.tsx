import { getSessionUser } from "@/lib/session";
import { PlayerProfileView } from "@/components/profile/PlayerProfileView";

export const dynamic = "force-dynamic";

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
