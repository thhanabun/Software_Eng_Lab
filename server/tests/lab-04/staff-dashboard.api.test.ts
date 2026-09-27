import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  const s = await createLoginUser("dstf-staff@example.test", "Dstf Staff");
  await prisma.user.update({ where: { id: s.id }, data: { role: "IT_STAFF" } });
  const a = await createLoginUser("dstf-admin@example.test", "Dstf Admin");
  await prisma.user.update({ where: { id: a.id }, data: { role: "ADMINISTRATOR" } });
  await createLoginUser("dstf-req@example.test", "Dstf Req");
  staff = await loginAgent(app, "dstf-staff@example.test");
  admin = await loginAgent(app, "dstf-admin@example.test");
  requester = await loginAgent(app, "dstf-req@example.test");
});

afterAll(async () => {
  for (const email of ["dstf-staff@example.test", "dstf-admin@example.test", "dstf-req@example.test"]) {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  }
});

describe("staff dashboard counts vs DB (DSTF-01)", () => {
  it("metrics match direct queries; drill-down links present", async () => {
    const res = await staff.get("/api/dashboard/staff");
    expect(res.status).toBe(200);

    const [unassigned, byStatusRows, byPriorityRows] = await Promise.all([
      prisma.ticket.count({ where: { ownerId: null } }),
      prisma.ticket.groupBy({ by: ["currentStatus"], _count: { currentStatus: true } }),
      prisma.ticket.groupBy({ by: ["itPriority"], _count: { itPriority: true } }),
    ]);
    expect(res.body.metrics.unassigned).toBe(unassigned);
    for (const row of byStatusRows) {
      expect(res.body.metrics.byStatus[row.currentStatus]).toBe(row._count.currentStatus);
    }
    for (const row of byPriorityRows) {
      expect(res.body.metrics.byItPriority[row.itPriority]).toBe(row._count.itPriority);
    }
    expect(res.body.metrics.drillDown.unassigned).toMatchObject({ base: "/staff/tickets", query: "?ownerId=unassigned" });
    expect(res.body.recentUpdated.length).toBeLessThanOrEqual(5);
    for (const t of res.body.recentUpdated) {
      expect(t.drillDown.base).toBe(`/staff/tickets/${t.id}`);
    }
    expect(res.body.userCounts).toBeUndefined();
  });
});

describe("staff dashboard roles + empty (DSTF-02)", () => {
  it("requester -> 403; admin sees userCounts", async () => {
    const denied = await requester.get("/api/dashboard/staff");
    expect(denied.status).toBe(403);

    const res = await admin.get("/api/dashboard/staff");
    expect(res.status).toBe(200);
    expect(res.body.userCounts).toMatchObject({ requesters: expect.any(Number), staff: expect.any(Number) });
    expect(res.body.userCounts.inactive).toBeGreaterThanOrEqual(1);
  });
});

describe("dashboard latency smoke (PERF-01)", () => {
  it("both dashboards respond under 2s on seeded data", async () => {
    const t0 = Date.now();
    const r1 = await requester.get("/api/dashboard/requester");
    const t1 = Date.now();
    const r2 = await staff.get("/api/dashboard/staff");
    const t2 = Date.now();
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(t1 - t0).toBeLessThan(2000);
    expect(t2 - t1).toBeLessThan(2000);
  });
});
