// E2E support (dev only): provisions DEDICATED login-capable accounts for the
// Playwright suites. Seed users are never mutated (server suites depend on
// their documented dev password + must-change state), so the E2E accounts
// live under their own emails and survive re-seeding untouched.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2eTest123!";
export const E2E_USERS = [
  { email: "e2e.alice@example.test", name: "E2E Alice" },
  { email: "e2e.carlos@example.test", name: "E2E Carlos" },
];

export async function pinE2EUsers(db: PrismaClient = prisma): Promise<void> {
  const passwordHash = await hashPassword(E2E_PASSWORD);
  for (const user of E2E_USERS) {
    await db.user.upsert({
      where: { email: user.email },
      update: { name: user.name, active: true, role: "REQUESTER", passwordHash, mustChangePassword: false },
      create: { ...user, active: true, role: "REQUESTER", passwordHash, mustChangePassword: false },
    });
  }
  console.log(`Pinned E2E logins for ${E2E_USERS.length} users`);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url.endsWith("e2e-users.ts");

if (isDirectRun) {
  pinE2EUsers()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
