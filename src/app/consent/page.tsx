import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { ConsentClient } from "@/components/ConsentClient";

export default async function ConsentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.pdConsentAt) {
    redirect(user.role === "ADMIN" ? "/admin" : "/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <ConsentClient />
    </main>
  );
}
