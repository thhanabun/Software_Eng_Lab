import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

const CATEGORY_NAMES = [
  "Account and Access",
  "Hardware",
  "Software",
  "Network",
];

const RELATED_SYSTEMS = [
  { name: "Email", active: true },
  { name: "Campus Wi-Fi", active: true },
  { name: "VPN", active: true },
  { name: "LEB2 App", active: true },
  { name: "Grade Submission App", active: true },
  { name: "Printer", active: true },
  { name: "Corporate Laptop", active: true },
];

const REQUESTERS = [
  { name: "Alice Carter", email: "alice.carter@student.example", active: true },
  { name: "Benjalak Suwan", email: "benjalak.suw@student.example", active: true },
  { name: "Carlos Reyes", email: "carlos.reyes@student.example", active: true },
  { name: "Duanpen Jaidee", email: "duanpen.jai@student.example", active: true },
  { name: "Ekarin Prasert", email: "ekarin.pra@student.example", active: false },
];

export async function seedAll(db: PrismaClient): Promise<void> {
  for (const name of CATEGORY_NAMES) {
    await db.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const system of RELATED_SYSTEMS) {
    await db.relatedSystem.upsert({
      where: { name: system.name },
      // Intentionally not updating "active": manual deactivation must survive re-seeding.
      update: {},
      create: system,
    });
  }

  for (const requester of REQUESTERS) {
    await db.requesterUser.upsert({
      where: { email: requester.email },
      // Intentionally not updating "active": manual deactivation must survive re-seeding.
      update: { name: requester.name },
      create: requester,
    });
  }
}

async function main() {
  await seedAll(prisma);
  console.log(
    `Seeded ${CATEGORY_NAMES.length} categories, ${RELATED_SYSTEMS.length} related systems, ${REQUESTERS.length} requesters (${REQUESTERS.filter((r) => !r.active).length} inactive)`,
  );
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
