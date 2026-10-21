import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { getImpersonatorId, getSessionUser } from "@/lib/session";
import { checkAchievementsThrottled, getUnseenAchievements, type UnlockedAchievement } from "@/lib/achievements";
import { AchievementCelebration } from "@/components/achievements/AchievementCelebration";
import { Navbar } from "@/components/Navbar";
import { VoiceDock } from "@/components/voice/VoiceDock";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.pdConsentAt) redirect("/consent");

  // Ачивки: проверка не чаще раза в 2 минуты + окно с конфетти для новых
  let unseen: UnlockedAchievement[] = [];
  if (user.role === "STUDENT") {
    await checkAchievementsThrottled(user.id);
    if (!(await getImpersonatorId())) unseen = await getUnseenAchievements(user.id).catch(() => []);
  }

  return (
    <>
      <Navbar />
      <main className="rise-in page-shell py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] min-[720px]:py-10 min-[720px]:pb-10">
        <ViewTransition>{children}</ViewTransition>
      </main>
      <VoiceDock role={user.role} myId={user.id} />
      {unseen.length > 0 && <AchievementCelebration items={unseen} />}
    </>
  );
}
