import { AdminAttendanceClient } from "@/components/AdminAttendanceClient";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Посещаемость · Админка" };

export default function AdminAttendancePage() {
  return (
    <div>
      <PageHeader eyebrow="Панель тренера" title="Посещаемость" description="Отметьте пришедших — +0.5 очка начислятся автоматически. Снятие отметки откатывает очки." />
      <AdminAttendanceClient />
    </div>
  );
}
