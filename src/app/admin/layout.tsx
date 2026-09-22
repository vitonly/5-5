import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Navbar } from "@/components/Navbar";
import { ChatPanel } from "@/components/ChatPanel";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/profile");

  return (
    <div className="admin-scope">
      <Navbar />
      <div className="border-b border-[var(--admin-border)] bg-[var(--admin-bg)]">
        <div className="page-shell py-3">
          <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--admin)]">
            Панель тренера
          </p>
        </div>
      </div>
      <main className="page-shell py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] min-[720px]:py-10 min-[720px]:pb-10">
        {children}
      </main>
      <ChatPanel role={user.role} myId={user.id} />
    </div>
  );
}
