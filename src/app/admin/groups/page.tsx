import { PageHeader } from "@/components/ui/page-header";
import { AdminGroupsClient } from "@/components/AdminGroupsClient";

export const metadata = { title: "Группы · Админка" };

export default function AdminGroupsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Панель тренера"
        title="Группы"
        description="Соберите учеников в группы — потом домашки, запись на 5v5 и напоминания можно отправлять целой группе."
      />
      <AdminGroupsClient />
    </div>
  );
}
