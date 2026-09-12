import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";
import { createLoginUser, loginAgent, type TestAgent } from "../helpers";

process.env.BCRYPT_COST = "4";

let app: Express;
let staff: TestAgent;
let admin: TestAgent;
let requester: TestAgent;

interface QueueItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  owner: string | null;
  requesterName: string;
  createdAt: string;
  updatedAt: string;
}

interface QueueBody {
  items: QueueItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  const s = await createLoginUser("queue-staff@example.test", "Queue Staff");
  await prisma.user.update({ where: { id: s.id }, data: { role: "IT_STAFF" } });
  const a = await createLoginUser("queue-admin@example.test", "Queue Admin");
  await prisma.user.update({ where: { id: a.id }, data: { role: "ADMINISTRATOR" } });
  await createLoginUser("queue-req@example.test", "Queue Req");
  staff = await loginAgent(app, "queue-staff@example.test");
  admin = await loginAgent(app, "queue-admin@example.test");
  requester = await loginAgent(app, "queue-req@example.test");
});

describe("GET /api/staff/tickets happy paths (Q-01)", () => {
  it("returns slices with metadata and FIFO defaults for staff and admin", async () => {
    for (const agent of [staff, admin]) {
      const res = await agent.get("/api/staff/tickets");
      expect(res.status).toBe(200);
      const body = res.body as QueueBody;
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(10);
      expect(body.totalItems).toBeGreaterThan(0);
      expect(body.totalPages).toBeGreaterThanOrEqual(1);
      const created = body.items.map((t) => t.createdAt);
      expect([...created].sort()).toEqual(created);
      for (const item of body.items) {
        expect(item.ticketNumber).toMatch(/^TKT-/);
        expect(typeof item.requesterName).toBe("string");
      }
    }
  });

  it("searches number, summary, and description case-insensitively", async () => {
    const seed = await staff.get("/api/staff/tickets").then((r) => r.body as QueueBody);
    const first = seed.items[0];
    const byNumber = (await staff.get("/api/staff/tickets").query({ search: first.ticketNumber })) as unknown as { body: QueueBody };
    expect(byNumber.body.items.map((t) => t.id)).toContain(first.id);

    const bySummary = (await staff.get("/api/staff/tickets").query({ search: first.summary.slice(0, 8).toLowerCase() })) as unknown as { body: QueueBody };
    expect(bySummary.body.items.map((t) => t.id)).toContain(first.id);
  });

  it("filters by status, category, priorities, and owner/unassigned", async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { email: "queue-staff@example.test" } });
    const all = (await staff.get("/api/staff/tickets").query({ pageSize: 25 })) as unknown as { body: QueueBody };

    const byStatus = (await staff.get("/api/staff/tickets").query({ status: "NEW" })) as unknown as { body: QueueBody };
    expect(byStatus.body.items.every((t) => t.currentStatus === "NEW")).toBe(true);

    const unassigned = (await staff.get("/api/staff/tickets").query({ ownerId: "unassigned" })) as unknown as { body: QueueBody };
    expect(unassigned.body.items.every((t) => t.owner === null)).toBe(true);
    expect(unassigned.body.totalItems).toBeLessThan(all.body.totalItems);

    const mine = (await staff.get("/api/staff/tickets").query({ ownerId: String(me.id) })) as unknown as { body: QueueBody };
    expect(mine.body.items.every((t) => t.owner !== null)).toBe(true);

    const itUrgent = (await staff.get("/api/staff/tickets").query({ itPriority: "URGENT" })) as unknown as { body: QueueBody };
    expect(itUrgent.body.items.every((t) => t.itPriority === "URGENT")).toBe(true);
  });

  it("sorts by priority rank and ticket number", async () => {
    const desc = (await staff.get("/api/staff/tickets").query({ sort: "itPriority:desc", pageSize: 25 })) as unknown as { body: QueueBody };
    const rank = (p: string) => ({ LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 })[p] ?? 9;
    const ranks = desc.body.items.map((t) => rank(t.itPriority));
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });
});

describe("GET /api/staff/tickets validation (Q-02, Q-03)", () => {
  it("rejects invalid params with 400 and ignores unknown ones", async () => {
    for (const query of [
      { sort: "nope:asc" },
      { page: "0" },
      { pageSize: "7" },
      { status: "SOMETHING" },
      { itPriority: "CRITICAL" },
      { ownerId: "zero" },
      { ownerId: "999999" },
      { categoryId: "999999" },
    ]) {
      const res = await staff.get("/api/staff/tickets").query(query);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }

    const unknown = await staff.get("/api/staff/tickets").query({ utm_source: "lab", page: "1" });
    expect(unknown.status).toBe(200);
  });

  it("forbids requesters and strangers", async () => {
    expect((await requester.get("/api/staff/tickets")).status).toBe(403);
    expect((await request(app).get("/api/staff/tickets")).status).toBe(401);
  });
});
