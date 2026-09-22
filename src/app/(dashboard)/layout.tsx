import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Navbar } from "@/components/Navbar";
import { ChatPanel } from "@/components/ChatPanel";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <Navbar />
      <main className="page-shell py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] min-[720px]:py-10 min-[720px]:pb-10">
        {children}
      </main>
      <ChatPanel role={user.role} myId={user.id} />
    </>
  );
}
