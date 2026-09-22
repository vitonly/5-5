import { prisma } from "@/lib/db";
import { AdminStudentsClient } from "@/components/AdminStudentsClient";

export default async function AdminStudentsPage() {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
    orderBy: { firstName: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Ученики</h1>
      <AdminStudentsClient students={students} />
    </div>
  );
}
