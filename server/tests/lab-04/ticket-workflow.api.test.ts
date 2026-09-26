import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";
import { createLoginUser, loginAgent, type TestAgent } from "../helpers";

process.env.BCRYPT_COST = "4";

let app: Express;
let staff: TestAgent;
let requester: TestAgent;
let ticketIds: number[] = [];

async function makeTicket(
  requesterEmail: string,
  status: "NEW" | "OPEN" | "IN_PROGRESS" | "CANCELLED" = "OPEN",
): Promise<number> {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow();
  const requesterUser = await prisma.user.findUniqueOrThrow({ where: { email: requesterEmail } });
  const staffUser = await prisma.user.findUniqueOrThrow({ where: { email: "wf-staff@example.test" } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-20260913-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "workflow probe",
      description: "workflow probe body",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
      ownerId: status === "NEW" ? null : staffUser.id,
    },
  });
  ticketIds.push(ticket.id);
  return ticket.id;
}

async function addAction(ticketId: number, performerEmail: string): Promise<void> {
  const performer = await prisma.user.findUniqueOrThrow({ where: { email: performerEmail } });
  await prisma.actionTaken.create({
    data: {
      ticketId,
      performedById: performer.id,
      description: "Seeded workflow action.",
      result: "Seeded result.",
      followUpRequired: false,
    },
  });
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  const s = await createLoginUser("wf-staff@example.test", "Wf Staff");
  await prisma.user.update({ where: { id: s.id }, data: { role: "IT_STAFF" } });
  await createLoginUser("wf-req@example.test", "Wf Req");
  staff = await loginAgent(app, "wf-staff@example.test");
  requester = await loginAgent(app, "wf-req@example.test");
});

afterAll(async () => {
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  for (const email of ["wf-staff@example.test", "wf-req@example.test"]) {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  }
});

describe("resolution gate (WF-01, WF-02, BR-10)", () => {
  it("rejects IN_PROGRESS->RESOLVED with zero actions, allows it with >=1 action", async () => {
    const bare = await makeTicket("wf-req@example.test", "IN_PROGRESS");
    const denied = await staff.patch(`/api/staff/tickets/${bare}/status`).send({ status: "RESOLVED" });
    expect(denied.status).toBe(400);
    expect(denied.body.error.message).toMatch(/at least one recorded action/i);

    await addAction(bare, "wf-staff@example.test");
    const allowed = await staff.patch(`/api/staff/tickets/${bare}/status`).send({ status: "RESOLVED" });
    expect(allowed.status).toBe(200);
    expect(allowed.body.currentStatus).toBe("RESOLVED");
    expect(allowed.body.updatedAt).toBeDefined();
  });
});

describe("matrix + roles (WF-03)", () => {
  it("rejects off-matrix transitions and requester attempts", async () => {
    const id = await makeTicket("wf-req@example.test", "OPEN");
    const off = await staff.patch(`/api/staff/tickets/${id}/status`).send({ status: "RESOLVED" });
    expect(off.status).toBe(400);

    const byRequester = await requester.patch(`/api/staff/tickets/${id}/status`).send({ status: "IN_PROGRESS" });
    expect(byRequester.status).toBe(403);

    const legal = await staff.patch(`/api/staff/tickets/${id}/status`).send({ status: "IN_PROGRESS" });
    expect(legal.status).toBe(200);
  });
});

describe("stale stamps (WF-04, BR-11)", () => {
  it("409s stale stamps on status/assign/priority; absent stamp still passes (Lab 3 compat)", async () => {
    const id = await makeTicket("wf-req@example.test", "OPEN");

    const noStamp = await staff.patch(`/api/staff/tickets/${id}/status`).send({ status: "IN_PROGRESS" });
    expect(noStamp.status).toBe(200);

    const stamp = (await prisma.ticket.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
    const stale = await staff
      .patch(`/api/staff/tickets/${id}/priority`)
      .send({ itPriority: "HIGH", expectedUpdatedAt: "2001-01-01T00:00:00.000Z" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");

    const fresh = await staff
      .patch(`/api/staff/tickets/${id}/priority`)
      .send({ itPriority: "HIGH", expectedUpdatedAt: stamp });
    expect(fresh.status).toBe(200);
    expect(fresh.body.updatedAt).toBeDefined();

    const badStamp = await staff.post(`/api/staff/tickets/${id}/assign`).send({ ownerId: null, expectedUpdatedAt: "nope" });
    expect(badStamp.status).toBe(400);
  });
});

describe("migration preserves data (MIG-03)", () => {
  it("prior users/tickets/comments/attachments intact; legacy tickets carry zero actions", async () => {
    const users = await prisma.user.count();
    const tickets = await prisma.ticket.count();
    expect(users).toBeGreaterThanOrEqual(10);
    expect(tickets).toBeGreaterThanOrEqual(8);

    const legacy = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-20260910-0101" } });
    expect(legacy.requesterId).toBeGreaterThan(0);
    expect(legacy.currentStatus).toBe("NEW");
    const actions = await prisma.actionTaken.count({ where: { ticketId: legacy.id } });
    expect(actions).toBe(0);

    const comments = await prisma.ticketComment.count();
    expect(comments).toBeGreaterThanOrEqual(4);
  });
});
