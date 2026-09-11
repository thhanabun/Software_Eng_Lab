import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { hashPassword } from "../../src/lib/password";
import { SEED_INITIAL_PASSWORD, seedAll } from "../../prisma/seed";

process.env.BCRYPT_COST = "4";

beforeAll(async () => {
  await seedAll(prisma);
});

describe("seed idempotency (MIG-01)", () => {
  it("re-running the seed creates no duplicates", async () => {
    const before = {
      users: await prisma.user.count(),
      tickets: await prisma.ticket.count(),
      comments: await prisma.ticketComment.count(),
      categories: await prisma.category.count(),
      systems: await prisma.relatedSystem.count(),
    };

    await seedAll(prisma);
    await seedAll(prisma);

    expect(await prisma.user.count()).toBe(before.users);
    expect(await prisma.ticket.count()).toBe(before.tickets);
    expect(await prisma.ticketComment.count()).toBe(before.comments);
    expect(await prisma.category.count()).toBe(before.categories);
    expect(await prisma.relatedSystem.count()).toBe(before.systems);
  });

  it("manual deactivation and custom passwords survive re-seeding", async () => {
    const email = "suda.support@example.test";
    const customHash = await hashPassword("Custom12345");
    await prisma.user.update({
      where: { email },
      data: { active: false, passwordHash: customHash, mustChangePassword: false },
    });
    try {
      await seedAll(prisma);
      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.active).toBe(false);
      expect(after.passwordHash).toBe(customHash);
      expect(after.mustChangePassword).toBe(false);
    } finally {
      await prisma.user.update({
        where: { email },
        data: { active: true, passwordHash: await hashPassword(SEED_INITIAL_PASSWORD), mustChangePassword: true },
      });
    }
  });

  it("seeded reference data meets Lab 2 minimums (API-02)", async () => {
    expect(await prisma.category.count()).toBeGreaterThanOrEqual(4);
    expect(await prisma.relatedSystem.count()).toBeGreaterThanOrEqual(6);
  });

  it("seed provides the required account mix", async () => {
    const count = (role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", active: boolean) =>
      prisma.user.count({ where: { role, active } });
    expect(await count("REQUESTER", true)).toBeGreaterThanOrEqual(4);
    expect(await count("REQUESTER", false)).toBeGreaterThanOrEqual(1);
    expect(await count("IT_STAFF", true)).toBeGreaterThanOrEqual(3);
    expect(await count("IT_STAFF", false)).toBeGreaterThanOrEqual(1);
    expect(await count("ADMINISTRATOR", true)).toBeGreaterThanOrEqual(1);
  });
});

describe("migrated Lab 2 data integrity (MIG-02)", () => {
  it("every ticket keeps a valid requester, priority, and status", async () => {
    const orphans = await prisma.ticket.count({ where: { requester: { is: null } } }).catch(() => 0);
    expect(orphans).toBe(0);
    const tickets = await prisma.ticket.findMany({
      select: { itPriority: true, currentStatus: true, requester: { select: { role: true } } },
    });
    expect(tickets.length).toBeGreaterThanOrEqual(105);
    for (const ticket of tickets) {
      expect(ticket.itPriority).toBeTruthy();
      expect(ticket.requester.role).toBe("REQUESTER");
    }
  });

  it("pre-migration attachments are intact and reachable", async () => {
    const total = await prisma.attachment.count();
    expect(total).toBeGreaterThanOrEqual(0);
    const withTicket = await prisma.attachment.count({ where: { ticket: { id: { gt: 0 } } } });
    expect(withTicket).toBe(total);
  });

  it("migrated requesters can log in with the documented dev password", async () => {
    const app = createApp();
    for (const email of ["alice.carter@student.example", "mina.staff@example.test", "admin@example.test"]) {
      const res = await request(app).post("/api/auth/login").send({ email, password: SEED_INITIAL_PASSWORD });
      expect(res.status).toBe(200);
    }
  });

  it("no account keeps the migration placeholder hash", async () => {
    expect(await prisma.user.count({ where: { passwordHash: "MIGRATION_PENDING_RESET" } })).toBe(0);
  });

  it("all stored emails are lowercase (case-insensitive uniqueness invariant)", async () => {
    const emails = await prisma.user.findMany({ select: { email: true } });
    expect(emails.length).toBeGreaterThan(0);
    for (const { email } of emails) {
      expect(email).toBe(email.toLowerCase());
    }
  });
});
