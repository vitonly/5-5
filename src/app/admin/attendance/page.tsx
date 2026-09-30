import { AdminAttendanceClient } from "@/components/AdminAttendanceClient";

export default function AdminAttendancePage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Посещаемость</h1>
      <AdminAttendanceClient />
    </div>
  );
}
