import { prisma } from "../src/lib/db";
import { runAutomation } from "../src/lib/automation";

async function main() {
  const result = await runAutomation();
  console.log("Automation complete:", result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
