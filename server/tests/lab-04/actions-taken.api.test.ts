import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";
import { createLoginUser, loginAgent, type TestAgent } from "../helpers";

process.env.BCRYPT_COST = "4";

let app: Express;
let staff: TestAgent;
let staffB: TestAgent;
let admin: TestAgent;
let requester: TestAgent;
let requesterB: TestAgent;
let staffId: number;
let ticketIds: number[] = [];

async function makeTicket(requesterEmail: string, status: "NEW" | "OPEN" | "IN_PROGRESS" | "CANCELLED" = "OPEN"): Promise<number> {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow();
  const requesterUser = await prisma.user.findUniqueOrThrow({ where: { email: requesterEmail } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-20260912-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "actions probe",
      description: "actions probe body",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
      ownerId: status === "NEW" ? null : staffId,
    },
  });
  ticketIds.push(ticket.id);
  return ticket.id;
}

const validAction = () => ({
  description: "Restarted the print spooler and cleared the jam queue.",
  result: "Queue drains normally; test page printed cleanly.",
  followUpRequired: false,
});

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  staffId = (await createLoginUser("act-staff@example.test", "Act Staff")).id;
  await prisma.user.update({ where: { id: staffId }, data: { role: "IT_STAFF" } });
  const b = await createLoginUser("act-staffb@example.test", "Act Staff B");
  await prisma.user.update({ where: { id: b.id }, data: { role: "IT_STAFF" } });
  const a = await createLoginUser("act-admin@example.test", "Act Admin");
  await prisma.user.update({ where: { id: a.id }, data: { role: "ADMINISTRATOR" } });
  await createLoginUser("act-req@example.test", "Act Req");
  await createLoginUser("act-reqb@example.test", "Act Req B");
  staff = await loginAgent(app, "act-staff@example.test");
  staffB = await loginAgent(app, "act-staffb@example.test");
  admin = await loginAgent(app, "act-admin@example.test");
  requester = await loginAgent(app, "act-req@example.test");
  requesterB = await loginAgent(app, "act-reqb@example.test");
});

afterAll(async () => {
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  for (const email of ["act-staff@example.test", "act-staffb@example.test", "act-admin@example.test", "act-req@example.test", "act-reqb@example.test"]) {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  }
});

describe("create valid action (ACT-01)", () => {
  it("201s under the correct ticket with server timestamp + session performer, bumps updatedAt", async () => {
    const id = await makeTicket("act-req@example.test");
    const before = (await prisma.ticket.findUniqueOrThrow({ where: { id } })).updatedAt.getTime();
    const res = await staff.post(`/api/staff/tickets/${id}/actions`).send(validAction());
    expect(res.status).toBe(201);
    expect(res.body.description).toContain("spooler");
    expect(res.body.performedByName).toBe("Act Staff");
    expect(res.body.performedByRole).toBe("IT_STAFF");
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const after = (await prisma.ticket.findUniqueOrThrow({ where: { id } })).updatedAt.getTime();
    expect(after).toBeGreaterThanOrEqual(before);

    const adminRes = await admin.post(`/api/staff/tickets/${id}/actions`).send({ ...validAction(), description: "Admin follow-up check." });
    expect(adminRes.status).toBe(201);
  });
});

describe("follow-up coupling (ACT-02)", () => {
  it("rejects flag-without-note, note-without-flag, and overlong fields", async () => {
    const id = await makeTicket("act-req@example.test");
    const noNote = await staff.post(`/api/staff/tickets/${id}/actions`).send({ ...validAction(), followUpRequired: true });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.details[0].field).toBe("followUpNote");

    const strayNote = await staff.post(`/api/staff/tickets/${id}/actions`).send({ ...validAction(), followUpNote: "stray" });
    expect(strayNote.status).toBe(400);

    const ok = await staff
      .post(`/api/staff/tickets/${id}/actions`)
      .send({ ...validAction(), followUpRequired: true, followUpNote: "Recheck in the morning." });
    expect(ok.status).toBe(201);
    expect(ok.body.followUpNote).toContain("morning");

    const long = await staff.post(`/api/staff/tickets/${id}/actions`).send({ ...validAction(), description: "x".repeat(2001) });
    expect(long.status).toBe(400);
  });
});

describe("requester access (ACT-03, ACT-04)", () => {
  it("requester create/edit -> 403; list-own returns full entries", async () => {
    const id = await makeTicket("act-req@example.test");
    await staff.post(`/api/staff/tickets/${id}/actions`).send(validAction());

    const create = await requester.post(`/api/staff/tickets/${id}/actions`).send(validAction());
    expect(create.status).toBe(403);

    const list = await requester.get(`/api/tickets/${id}/actions`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].description).toContain("spooler");

    const edit = await requester.patch(`/api/staff/tickets/${id}/actions/1`).send({ result: "hacked" });
    expect(edit.status).toBe(403);
  });

  it("cross-requester list -> 404 with no leakage", async () => {
    const id = await makeTicket("act-req@example.test");
    await staff.post(`/api/staff/tickets/${id}/actions`).send(validAction());
    const other = await requesterB.get(`/api/tickets/${id}/actions`);
    expect(other.status).toBe(404);
  });

  it("logged-out list -> 401", async () => {
    const res = await import("supertest").then((s) => s.default(createApp()).get("/api/staff/tickets/1/actions"));
    expect(res.status).toBe(401);
  });
});

describe("boundaries (ACT-05)", () => {
  it("enforces 2000/2001 description+result, 1000/1001 follow-up note, 500/501 attachment notes", async () => {
    const id = await makeTicket("act-req@example.test");
    const edge = await staff.post(`/api/staff/tickets/${id}/actions`).send({
      description: "d".repeat(2000),
      result: "r".repeat(2000),
      followUpRequired: true,
      followUpNote: "n".repeat(1000),
      attachmentNotes: "a".repeat(500),
    });
    expect(edge.status).toBe(201);

    for (const payload of [
      { ...validAction(), result: "r".repeat(2001) },
      { ...validAction(), followUpRequired: true, followUpNote: "n".repeat(1001) },
      { ...validAction(), attachmentNotes: "a".repeat(501) },
    ]) {
      const res = await staff.post(`/api/staff/tickets/${id}/actions`).send(payload);
      expect(res.status).toBe(400);
    }
  });
});

describe("CANCELLED freeze (ACT-06)", () => {
  it("rejects action writes on CANCELLED but staff list still reads", async () => {
    const id = await makeTicket("act-req@example.test", "CANCELLED");
    const create = await staff.post(`/api/staff/tickets/${id}/actions`).send(validAction());
    expect(create.status).toBe(400);

    const list = await staff.get(`/api/staff/tickets/${id}/actions`);
    expect(list.status).toBe(200);
  });
});

describe("edit + stale handling + 405", () => {
  it("edits with fresh stamp, 409s stale, flips clear notes, DELETE -> 405", async () => {
    const id = await makeTicket("act-req@example.test");
    const created = await staff
      .post(`/api/staff/tickets/${id}/actions`)
      .send({ ...validAction(), followUpRequired: true, followUpNote: "Watch it." });
    expect(created.status).toBe(201);
    const actionId = created.body.id as number;

    const stamp = (await prisma.ticket.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
    const edited = await staff
      .patch(`/api/staff/tickets/${id}/actions/${actionId}`)
      .send({ result: "Updated result.", expectedUpdatedAt: stamp });
    expect(edited.status).toBe(200);
    expect(edited.body.result).toBe("Updated result.");
    expect(edited.body.followUpNote).toContain("Watch it");

    const stale = await staff
      .patch(`/api/staff/tickets/${id}/actions/${actionId}`)
      .send({ result: "Stale write.", expectedUpdatedAt: stamp });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");

    const fresh = (await prisma.ticket.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
    const flip = await staff
      .patch(`/api/staff/tickets/${id}/actions/${actionId}`)
      .send({ followUpRequired: false, expectedUpdatedAt: fresh });
    expect(flip.status).toBe(200);
    expect(flip.body.followUpNote).toBeNull();

    const del = await staff.delete(`/api/staff/tickets/${id}/actions/${actionId}`);
    expect(del.status).toBe(405);
    expect(del.headers.allow).toContain("PATCH");
  });
});
