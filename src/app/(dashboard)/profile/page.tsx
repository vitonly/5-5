import { getSessionUser } from "@/lib/session";
import { PlayerProfileView } from "@/components/profile/PlayerProfileView";

export const metadata = { title: "Мой профиль" };

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSessionUser();
  if (!user?.profile) return <p className="text-[var(--text-2)]">Профиль не найден</p>;
  const { tab } = await searchParams;

  return <PlayerProfileView userId={user.id} viewer={user} initialTab={tab} />;
}
