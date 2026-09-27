import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";
import { createLoginUser, loginAgent, type TestAgent } from "../helpers";

process.env.BCRYPT_COST = "4";

let app: Express;
let requester: TestAgent;
let requesterB: TestAgent;
let staff: TestAgent;
let ticketIds: number[] = [];

async function makeTicket(requesterEmail: string, status: "OPEN" | "WAITING_FOR_REQUESTER" | "RESOLVED" = "OPEN"): Promise<number> {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow();
  const requesterUser = await prisma.user.findUniqueOrThrow({ where: { email: requesterEmail } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-20260914-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "dashboard probe",
      description: "dashboard probe body",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
    },
  });
  ticketIds.push(ticket.id);
  return ticket.id;
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  await createLoginUser("dreq-req@example.test", "Dreq Req");
  await createLoginUser("dreq-reqb@example.test", "Dreq Req B");
  const s = await createLoginUser("dreq-staff@example.test", "Dreq Staff");
  await prisma.user.update({ where: { id: s.id }, data: { role: "IT_STAFF" } });
  requester = await loginAgent(app, "dreq-req@example.test");
  requesterB = await loginAgent(app, "dreq-reqb@example.test");
  staff = await loginAgent(app, "dreq-staff@example.test");
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  for (const email of ["dreq-req@example.test", "dreq-reqb@example.test", "dreq-staff@example.test"]) {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  }
});

describe("requester dashboard isolation (DREQ-01)", () => {
  it("returns owned metrics/recents only; cross-requester data never leaks", async () => {
    const mine = await makeTicket("dreq-req@example.test", "WAITING_FOR_REQUESTER");
    await makeTicket("dreq-reqb@example.test", "OPEN");

    const res = await requester.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    expect(res.body.metrics.open).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.waitingForRequester).toBeGreaterThanOrEqual(1);
    const ids = [...res.body.recentUpdated, ...res.body.recentResolved].map((t: { id: number }) => t.id);
    expect(ids).toContain(mine);
    for (const t of res.body.recentUpdated) {
      expect(t.drillDown.base).toBe(`/tickets/${t.id}`);
    }
    const attentionIds = res.body.attention.map((t: { id: number }) => t.id);
    expect(attentionIds).toContain(mine);

    // Other requester's dashboard must not contain my ticket.
    const other = await requesterB.get("/api/dashboard/requester");
    const otherIds = [...other.body.recentUpdated, ...other.body.recentResolved, ...other.body.attention].map(
      (t: { id: number }) => t.id,
    );
    expect(otherIds).not.toContain(mine);
  });

  it("staff role is rejected from the requester endpoint", async () => {
    const res = await staff.get("/api/dashboard/requester");
    expect(res.status).toBe(403);
  });
});

describe("resolved30d boundary (DREQ-01)", () => {
  it("excludes RESOLVED tickets updated more than 30 days ago", async () => {
    const id = await makeTicket("dreq-req@example.test", "RESOLVED");
    await prisma.ticket.update({
      where: { id },
      data: { updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
    });

    const res = await requester.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    // The 30-day window applies to the metric (no other recent RESOLVED tickets exist for this user).
    expect(res.body.metrics.resolved30d).toBe(0);
  });

  it("metric cards carry drill-downs (BR-16)", async () => {
    const res = await requester.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    expect(res.body.metrics.drillDown).toMatchObject({
      open: { base: "/tickets", query: "" },
      waitingForRequester: { base: "/tickets", query: "?status=WAITING_FOR_REQUESTER" },
      resolved30d: { base: "/tickets", query: "?status=RESOLVED" },
    });
  });
});

describe("requester dashboard empty state (DREQ-02)", () => {
  it("returns zeros + empty arrays, never 404", async () => {
    await createLoginUser("dreq-empty@example.test", "Dreq Empty");
    const empty = await loginAgent(app, "dreq-empty@example.test");
    try {
      const res = await empty.get("/api/dashboard/requester");
      expect(res.status).toBe(200);
      expect(res.body.metrics).toMatchObject({ open: 0, waitingForRequester: 0, resolved30d: 0 });
      expect(res.body.recentUpdated).toEqual([]);
      expect(res.body.recentResolved).toEqual([]);
      expect(res.body.attention).toEqual([]);
    } finally {
      await prisma.session.deleteMany({ where: { user: { email: "dreq-empty@example.test" } } });
      await prisma.user.deleteMany({ where: { email: "dreq-empty@example.test" } });
    }
  });
});
