// Loads .env.local / .env like Next.js does, so DATABASE_URL is available.
import "../lib/load-env";
import prisma from "../lib/prisma";
import { syncCcmasCatalogue } from "../lib/courses/ccmas-catalogue";

async function main() {
  const result = await syncCcmasCatalogue();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
