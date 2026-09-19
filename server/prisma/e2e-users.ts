// E2E support (dev only): provisions DEDICATED login-capable accounts for the
// Playwright suites. Seed users are never mutated (server suites depend on
// their documented dev password + must-change state), so the E2E accounts
// live under their own emails and survive re-seeding untouched.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2eTest123!";

type E2ESeedUser = {
  email: string;
  name: string;
  role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
  active: boolean;
  mustChangePassword: boolean;
};

export const E2E_USERS: E2ESeedUser[] = [
  { email: "e2e.alice@example.test", name: "E2E Alice", role: "REQUESTER", active: true, mustChangePassword: false },
  { email: "e2e.carlos@example.test", name: "E2E Carlos", role: "REQUESTER", active: true, mustChangePassword: false },
  // Lab 3 roles: dedicated staff + admin logins for the Playwright suites.
  { email: "e2e.staff@example.test", name: "E2E Staff", role: "IT_STAFF", active: true, mustChangePassword: false },
  { email: "e2e.admin@example.test", name: "E2E Admin", role: "ADMINISTRATOR", active: true, mustChangePassword: false },
  // Forced-change flow: reset to pending on every setup run so E2E-01 is deterministic.
  { email: "e2e.mustchange@example.test", name: "E2E Mustchange", role: "REQUESTER", active: true, mustChangePassword: true },
  // Inactive login rejection (BR-07): always pinned deactivated.
  { email: "e2e.inactive@example.test", name: "E2E Inactive", role: "REQUESTER", active: false, mustChangePassword: false },
];

export async function pinE2EUsers(db: PrismaClient = prisma): Promise<void> {
  const passwordHash = await hashPassword(E2E_PASSWORD);
  for (const user of E2E_USERS) {
    await db.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        active: user.active,
        role: user.role,
        passwordHash,
        mustChangePassword: user.mustChangePassword,
      },
      create: {
        email: user.email,
        name: user.name,
        active: user.active,
        role: user.role,
        passwordHash,
        mustChangePassword: user.mustChangePassword,
      },
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
