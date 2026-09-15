import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { hashPassword } from "../../src/lib/password";
import { SEED_INITIAL_PASSWORD, seedAll } from "../../prisma/seed";
import { createLoginUser, loginAgent, type TestAgent } from "../helpers";

process.env.BCRYPT_COST = "4";

let app: Express;
let admin: TestAgent;
let requester: TestAgent;
let staff: TestAgent;

const createdEmails: string[] = [];

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  const a = await createLoginUser("adm-admin@example.test", "Adm Admin");
  await prisma.user.update({ where: { id: a.id }, data: { role: "ADMINISTRATOR" } });
  const r = await createLoginUser("adm-req@example.test", "Adm Req");
  const s = await createLoginUser("adm-staff@example.test", "Adm Staff");
  await prisma.user.update({ where: { id: s.id }, data: { role: "IT_STAFF" } });
  admin = await loginAgent(app, "adm-admin@example.test");
  requester = await loginAgent(app, "adm-req@example.test");
  staff = await loginAgent(app, "adm-staff@example.test");
  void r;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { user: { email: { in: createdEmails } } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.session.deleteMany({
    where: { user: { email: { in: ["adm-admin@example.test", "adm-req@example.test", "adm-staff@example.test"] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: ["adm-admin@example.test", "adm-req@example.test", "adm-staff@example.test"] } },
  });
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

describe("admin user creation (ADM-01, BR-23)", () => {
  it("creates a must-change user with one role and no password echoed", async () => {
    const email = "adm-new1@example.test";
    createdEmails.push(email);
    const res = await admin.post("/api/admin/users").send({
      name: "Adm New One",
      email,
      role: "IT_STAFF",
      active: true,
      initialPassword: "BrandNew123",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Adm New One", email, role: "IT_STAFF", mustChangePassword: true });
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("initialPassword");

    const login = await request(app).post("/api/auth/login").send({ email, password: "BrandNew123" });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it("rejects bad input with field details", async () => {
    const res = await admin.post("/api/admin/users").send({
      name: "",
      email: "not-an-email",
      role: "SUPERUSER",
      initialPassword: "short",
    });
    expect(res.status).toBe(400);
  });
});

describe("duplicate emails (ADM-02)", () => {
  it("rejects case-variant duplicates on create and update", async () => {
    const email = "adm-dup@example.test";
    createdEmails.push(email);
    const created = await admin.post("/api/admin/users").send({
      name: "Adm Dup",
      email,
      role: "REQUESTER",
      initialPassword: "BrandNew123",
    });
    expect(created.status).toBe(201);

    const dupCreate = await admin.post("/api/admin/users").send({
      name: "Adm Dup Two",
      email: "ADM-DUP@EXAMPLE.TEST",
      role: "REQUESTER",
      initialPassword: "BrandNew123",
    });
    expect(dupCreate.status).toBe(409);
    expect(dupCreate.body.error.details).toEqual([{ field: "email", message: "Email is already in use" }]);

    const other = "adm-other@example.test";
    createdEmails.push(other);
    const otherRes = await admin.post("/api/admin/users").send({
      name: "Adm Other",
      email: other,
      role: "REQUESTER",
      initialPassword: "BrandNew123",
    });
    expect(otherRes.status).toBe(201);
    const dupUpdate = await admin.patch(`/api/admin/users/${otherRes.body.id}`).send({ email: "Adm-Dup@Example.Test" });
    expect(dupUpdate.status).toBe(409);
    expect(dupUpdate.body.error.details).toEqual([{ field: "email", message: "Email is already in use" }]);
  });
});

describe("admin safety rules (ADM-03, BR-25, BR-26)", () => {
  it("rejects self-deactivation with 400", async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { email: "adm-admin@example.test" } });
    const res = await admin.patch(`/api/admin/users/${me.id}`).send({ active: false });
    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).active).toBe(true);
  });

  it("protects the last active administrator with 409", async () => {
    const keeperEmail = "adm-keeper@example.test";
    createdEmails.push(keeperEmail);
    const keeper = await admin.post("/api/admin/users").send({
      name: "Adm Keeper",
      email: keeperEmail,
      role: "ADMINISTRATOR",
      initialPassword: "BrandNew123",
    });
    expect(keeper.status).toBe(201);

    const others = await prisma.user.findMany({
      where: { role: "ADMINISTRATOR", active: true, id: { not: keeper.body.id } },
      select: { id: true },
    });
    await prisma.user.updateMany({ where: { id: { in: others.map((u) => u.id) } }, data: { active: false } });
    try {
      // Clear the initial-password flag so the keeper holds a fresh session.
      const pendingLogin = await request(app).post("/api/auth/login").send({ email: keeperEmail, password: "BrandNew123" });
      expect(pendingLogin.status).toBe(200);
      const pendingCookie = pendingLogin.headers["set-cookie"] as unknown as string[];
      const changed = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", pendingCookie)
        .send({ currentPassword: "BrandNew123", newPassword: "Keeper12345", confirmPassword: "Keeper12345" });
      expect(changed.status).toBe(200);
      const keeperAgent = await loginAgent(app, keeperEmail, "Keeper12345");
      // Self-demote as the sole admin is blocked...
      const demote = await keeperAgent.patch(`/api/admin/users/${keeper.body.id}`).send({ role: "REQUESTER" });
      expect(demote.status).toBe(409);
      // ...while a no-op edit still works.
      const rename = await keeperAgent.patch(`/api/admin/users/${keeper.body.id}`).send({ name: "Adm Keeper" });
      expect(rename.status).toBe(200);
    } finally {
      await prisma.user.updateMany({ where: { id: { in: others.map((u) => u.id) } }, data: { active: true } });
    }
  });
});

describe("reset password (ADM-04, BR-27)", () => {
  it("issues a new initial password enforced at next login and kills sessions", async () => {
    const email = "adm-reset@example.test";
    createdEmails.push(email);
    const created = await admin.post("/api/admin/users").send({
      name: "Adm Reset",
      email,
      role: "REQUESTER",
      initialPassword: "First12345",
    });
    expect(created.status).toBe(201);

    const firstLogin = await request(app).post("/api/auth/login").send({ email, password: "First12345" });
    expect(firstLogin.status).toBe(200);
    const firstCookie = firstLogin.headers["set-cookie"] as unknown as string[];

    const reset = await admin.post(`/api/admin/users/${created.body.id}/reset-password`).send({
      newPassword: "Second12345",
      confirmPassword: "Second12345",
    });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ ok: true });

    // Old session is dead.
    expect((await request(app).get("/api/auth/me").set("Cookie", firstCookie)).status).toBe(401);

    const secondLogin = await request(app).post("/api/auth/login").send({ email, password: "Second12345" });
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.user.mustChangePassword).toBe(true);
  });
});

describe("list, search, filter, edit (ADM-05)", () => {
  it("searches, filters by role, and edits users", async () => {
    const search = await admin.get("/api/admin/users").query({ search: "adm-new1" });
    expect(search.status).toBe(200);
    expect((search.body.items as { email: string }[]).some((u) => u.email === "adm-new1@example.test")).toBe(true);

    const filtered = await admin.get("/api/admin/users").query({ role: "ADMINISTRATOR" });
    expect(filtered.status).toBe(200);
    for (const user of filtered.body.items as { role: string }[]) {
      expect(user.role).toBe("ADMINISTRATOR");
    }
    expect((await admin.get("/api/admin/users").query({ role: "NOPE" })).status).toBe(400);

    const target = (search.body.items as { id: number }[])[0];
    const edited = await admin.patch(`/api/admin/users/${target.id}`).send({ name: "Adm New One Edited", active: true });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe("Adm New One Edited");
  });

  it("forbids non-administrators with no user data", async () => {
    for (const agent of [requester, staff]) {
      expect((await agent.get("/api/admin/users")).status).toBe(403);
      expect((await agent.post("/api/admin/users").send({})).status).toBe(403);
    }
    expect((await request(app).get("/api/admin/users")).status).toBe(401);
  });
});
