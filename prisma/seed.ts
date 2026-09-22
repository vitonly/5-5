/**
 * Создаёт тестового ученика login=1 / password=1 в текущей DATABASE_URL.
 *
 * 1. В .env поставь DATABASE_URL из Neon (Connect)
 * 2. npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const login = "1";
  const password = "1";
  const passwordHash = hashPassword(password);

  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, firstName: existing.firstName || "Ученик", role: "STUDENT" },
    });
    if (!existing.profile) {
      await prisma.playerProfile.create({ data: { userId: existing.id } }).catch(() => {});
    }
    console.log("Updated student: login=1 password=1");
    return;
  }

  await prisma.user.create({
    data: {
      firstName: "Ученик",
      login,
      passwordHash,
      role: "STUDENT",
      profile: { create: {} },
    },
  });
  console.log("Created student: login=1 password=1");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
