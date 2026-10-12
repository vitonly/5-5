import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Navbar } from "@/components/Navbar";
import { ChatPanel } from "@/components/ChatPanel";
import { VoiceDock } from "@/components/voice/VoiceDock";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.pdConsentAt) redirect("/consent");
  if (user.role !== "ADMIN") redirect("/profile");

  return (
    <div className="admin-scope">
      <Navbar />
      <main className="rise-in page-shell py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] min-[720px]:py-10 min-[720px]:pb-10">
        <ViewTransition>{children}</ViewTransition>
      </main>
      <VoiceDock role={user.role} myId={user.id} />
      <ChatPanel role={user.role} myId={user.id} />
    </div>
  );
}
