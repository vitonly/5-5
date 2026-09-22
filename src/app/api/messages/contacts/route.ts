import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { displayName } from "@/lib/utils";

export async function GET() {
  const me = await requireUser();

  if (me.role !== "ADMIN") {
    const unread = await prisma.message.count({
      where: { recipientId: me.id, read: false },
    });
    return NextResponse.json({ contacts: [], totalUnread: unread });
  }

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    orderBy: { firstName: "asc" },
  });

  const contacts = await Promise.all(
    students.map(async (student) => {
      const [lastMessage, unread] = await Promise.all([
        prisma.message.findFirst({
          where: {
            OR: [
              { senderId: me.id, recipientId: student.id },
              { senderId: student.id, recipientId: me.id },
            ],
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.message.count({
          where: { senderId: student.id, recipientId: me.id, read: false },
        }),
      ]);
      return {
        id: student.id,
        name: displayName(student),
        photoUrl: student.photoUrl,
        lastMessage: lastMessage?.body ?? null,
        lastAt: lastMessage?.createdAt ?? null,
        unread,
      };
    })
  );

  contacts.sort((a, b) => {
    if (b.unread !== a.unread) return b.unread - a.unread;
    const at = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const bt = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    return bt - at;
  });

  const totalUnread = contacts.reduce((sum, c) => sum + c.unread, 0);

  return NextResponse.json({ contacts, totalUnread });
}
