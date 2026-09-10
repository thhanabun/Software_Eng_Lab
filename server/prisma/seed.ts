import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { PLACEHOLDER_HASH, hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

// Dev-only initial password for seeded accounts (local development only —
// documented in README, never a real secret). Every seeded account starts in
// must-change state per BR-02/BR-23.
export const SEED_INITIAL_PASSWORD = process.env.SEED_INITIAL_PASSWORD ?? "Changeme123!";

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

type SeedUser = { name: string; email: string; role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; active: boolean };

const SEED_USERS: SeedUser[] = [
  // Lab 2 requesters — same emails so the migration matches them by email.
  { name: "Alice Carter", email: "alice.carter@student.example", role: "REQUESTER", active: true },
  { name: "Benjalak Suwan", email: "benjalak.suw@student.example", role: "REQUESTER", active: true },
  { name: "Carlos Reyes", email: "carlos.reyes@student.example", role: "REQUESTER", active: true },
  { name: "Duanpen Jaidee", email: "duanpen.jai@student.example", role: "REQUESTER", active: true },
  { name: "Ekarin Prasert", email: "ekarin.pra@student.example", role: "REQUESTER", active: false },
  { name: "Mina Staff", email: "mina.staff@example.test", role: "IT_STAFF", active: true },
  { name: "Nopparat Ops", email: "nopparat.ops@example.test", role: "IT_STAFF", active: true },
  { name: "Suda Support", email: "suda.support@example.test", role: "IT_STAFF", active: true },
  { name: "Wit Off", email: "wit.off@example.test", role: "IT_STAFF", active: false },
  { name: "Admin One", email: "admin@example.test", role: "ADMINISTRATOR", active: true },
];

type SeedTicket = {
  ticketNumber: string;
  requester: string;
  owner: string | null;
  category: string;
  system: string;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  currentStatus: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
};

const SEED_TICKETS: SeedTicket[] = [
  {
    ticketNumber: "TKT-20260910-0101", requester: "alice.carter@student.example", owner: null,
    category: "Hardware", system: "Corporate Laptop", summary: "Laptop will not power on",
    description: "Pressing the power button shows no lights or fan spin. Charger LED is green.",
    requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "NEW",
  },
  {
    ticketNumber: "TKT-20260910-0102", requester: "benjalak.suw@student.example", owner: "mina.staff@example.test",
    category: "Software", system: "LEB2 App", summary: "LEB2 upload stalls at 90 percent",
    description: "Video upload progress freezes near completion on campus Wi-Fi and on VPN alike.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "OPEN",
  },
  {
    ticketNumber: "TKT-20260910-0103", requester: "carlos.reyes@student.example", owner: "nopparat.ops@example.test",
    category: "Network", system: "Campus Wi-Fi", summary: "Dormitory Wi-Fi drops every hour",
    description: "Connection drops roughly hourly in Building C, reconnects after a minute.",
    requestedPriority: "HIGH", itPriority: "URGENT", currentStatus: "IN_PROGRESS",
  },
  {
    ticketNumber: "TKT-20260910-0104", requester: "duanpen.jai@student.example", owner: "suda.support@example.test",
    category: "Account and Access", system: "Email", summary: "Cannot sign in to mailbox",
    description: "Password reset completed but sign-in still reports invalid credentials.",
    requestedPriority: "URGENT", itPriority: "URGENT", currentStatus: "WAITING_FOR_REQUESTER",
  },
  {
    ticketNumber: "TKT-20260910-0105", requester: "alice.carter@student.example", owner: "mina.staff@example.test",
    category: "Hardware", system: "Printer", summary: "Library printer jams on duplex",
    description: "Double-sided jobs jam at the duplexer; single-sided prints fine.",
    requestedPriority: "LOW", itPriority: "LOW", currentStatus: "RESOLVED",
  },
  {
    ticketNumber: "TKT-20260910-0106", requester: "benjalak.suw@student.example", owner: "nopparat.ops@example.test",
    category: "Software", system: "Grade Submission App", summary: "Grade export missing rows",
    description: "CSV export omits the last page of results for large courses.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "CLOSED",
  },
  {
    ticketNumber: "TKT-20260910-0107", requester: "carlos.reyes@student.example", owner: null,
    category: "Network", system: "VPN", summary: "VPN client fails to connect",
    description: "Client reports gateway unreachable from home fiber connection.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "REOPENED",
  },
  {
    ticketNumber: "TKT-20260910-0108", requester: "duanpen.jai@student.example", owner: null,
    category: "Account and Access", system: "Email", summary: "Duplicate mailbox request",
    description: "Filed twice by mistake; keeping the newer ticket only.",
    requestedPriority: "LOW", itPriority: "LOW", currentStatus: "CANCELLED",
  },
];

type SeedComment = {
  ticketNumber: string;
  author: string;
  visibility: "PUBLIC" | "INTERNAL";
  body: string;
};

const SEED_COMMENTS: SeedComment[] = [
  {
    ticketNumber: "TKT-20260910-0102", author: "benjalak.suw@student.example", visibility: "PUBLIC",
    body: "The stall happens on two different networks, so it looks server-side rather than Wi-Fi.",
  },
  {
    ticketNumber: "TKT-20260910-0102", author: "mina.staff@example.test", visibility: "PUBLIC",
    body: "Acknowledged — checking the upload worker logs and will update this ticket.",
  },
  {
    ticketNumber: "TKT-20260910-0103", author: "nopparat.ops@example.test", visibility: "INTERNAL",
    body: "Building C access-point controller shows roaming flaps; spare unit reserved for swap.",
  },
  {
    ticketNumber: "TKT-20260910-0104", author: "suda.support@example.test", visibility: "INTERNAL",
    body: "Identity record shows a stale lock flag; waiting on requester reply before clearing.",
  },
];

export async function seedAll(db: PrismaClient): Promise<void> {
  for (const name of CATEGORY_NAMES) {
    await db.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const system of RELATED_SYSTEMS) {
    await db.relatedSystem.upsert({
      where: { name: system.name },
      // Intentionally not updating "active": manual deactivation must survive re-seeding.
      update: {},
      create: system,
    });
  }

  const devHash = await hashPassword(SEED_INITIAL_PASSWORD);
  for (const user of SEED_USERS) {
    const existing = await db.user.findUnique({ where: { email: user.email } });
    if (!existing) {
      await db.user.create({
        data: { ...user, passwordHash: devHash, mustChangePassword: true },
      });
    } else {
      // Never touch active/role: admin changes must survive re-seeding.
      // Refresh the hash only while it is still the migration placeholder.
      const data: { name: string; passwordHash?: string; mustChangePassword?: boolean } = { name: user.name };
      if (existing.passwordHash === PLACEHOLDER_HASH) {
        data.passwordHash = devHash;
        data.mustChangePassword = true;
      }
      await db.user.update({ where: { email: user.email }, data });
    }
  }

  const userId = async (email: string): Promise<number> => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    return user.id;
  };
  const categoryId = async (name: string): Promise<number> =>
    (await db.category.findUniqueOrThrow({ where: { name } })).id;
  const systemId = async (name: string): Promise<number> =>
    (await db.relatedSystem.findUniqueOrThrow({ where: { name } })).id;

  for (const ticket of SEED_TICKETS) {
    await db.ticket.upsert({
      where: { ticketNumber: ticket.ticketNumber },
      update: {},
      create: {
        ticketNumber: ticket.ticketNumber,
        requesterId: await userId(ticket.requester),
        ownerId: ticket.owner ? await userId(ticket.owner) : null,
        categoryId: await categoryId(ticket.category),
        relatedSystemId: await systemId(ticket.system),
        summary: ticket.summary,
        description: ticket.description,
        requestedPriority: ticket.requestedPriority,
        itPriority: ticket.itPriority,
        currentStatus: ticket.currentStatus,
      },
    });
  }

  for (const comment of SEED_COMMENTS) {
    const ticket = await db.ticket.findUniqueOrThrow({ where: { ticketNumber: comment.ticketNumber } });
    const authorId = await userId(comment.author);
    const existing = await db.ticketComment.findFirst({
      where: { ticketId: ticket.id, authorId, body: comment.body },
    });
    if (!existing) {
      await db.ticketComment.create({
        data: { ticketId: ticket.id, authorId, visibility: comment.visibility, body: comment.body },
      });
    }
  }
}

async function main() {
  await seedAll(prisma);
  console.log(
    `Seeded ${CATEGORY_NAMES.length} categories, ${RELATED_SYSTEMS.length} related systems, ${SEED_USERS.length} users, ${SEED_TICKETS.length} tickets, ${SEED_COMMENTS.length} comments`,
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
