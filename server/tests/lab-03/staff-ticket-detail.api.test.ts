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
let staffB: TestAgent;
let admin: TestAgent;
let requester: TestAgent;
let staffId: number;
let staffBId: number;

async function makeOwnedTicket(ownerEmail: string, status: "NEW" | "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" = "NEW"): Promise<number> {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow();
  const requesterUser = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", active: true } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-20260911-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "staff ops probe",
      description: "staff ops probe body",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
      ownerId: status === "NEW" ? null : owner.id,
    },
  });
  return ticket.id;
}

async function cleanupTicket(id: number): Promise<void> {
  await prisma.ticketComment.deleteMany({ where: { ticketId: id } });
  await prisma.ticket.delete({ where: { id } });
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  staffId = (await createLoginUser("stop-staff@example.test", "Stop Staff")).id;
  await prisma.user.update({ where: { id: staffId }, data: { role: "IT_STAFF" } });
  staffBId = (await createLoginUser("stop-staffb@example.test", "Stop Staff B")).id;
  await prisma.user.update({ where: { id: staffBId }, data: { role: "IT_STAFF" } });
  const a = await createLoginUser("stop-admin@example.test", "Stop Admin");
  await prisma.user.update({ where: { id: a.id }, data: { role: "ADMINISTRATOR" } });
  await createLoginUser("stop-req@example.test", "Stop Req");
  staff = await loginAgent(app, "stop-staff@example.test");
  staffB = await loginAgent(app, "stop-staffb@example.test");
  admin = await loginAgent(app, "stop-admin@example.test");
  requester = await loginAgent(app, "stop-req@example.test");
});

describe("claim (STOP-01, AD-09)", () => {
  it("claims unassigned tickets with NEW->OPEN, no-ops self-claims, 409s foreign claims", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      const claimed = await staff.post(`/api/staff/tickets/${id}/claim`);
      expect(claimed.status).toBe(200);
      expect(claimed.body.owner).toMatchObject({ id: staffId });
      expect(claimed.body.currentStatus).toBe("OPEN");

      const again = await staff.post(`/api/staff/tickets/${id}/claim`);
      expect(again.status).toBe(200);

      const foreign = await staffB.post(`/api/staff/tickets/${id}/claim`);
      expect(foreign.status).toBe(409);
      expect(foreign.body.error.code).toBe("CONFLICT");
    } finally {
      await cleanupTicket(id);
    }
  });

  it("404s missing tickets and 403s requesters", async () => {
    expect((await staff.post("/api/staff/tickets/999999/claim")).status).toBe(404);
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      expect((await requester.post(`/api/staff/tickets/${id}/claim`)).status).toBe(403);
    } finally {
      await cleanupTicket(id);
    }
  });
});

describe("assign (STOP-02, AC-15)", () => {
  it("assigns, reassigns, unassigns with status coupling, and no-ops repeats", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      const assigned = await staff.post(`/api/staff/tickets/${id}/assign`).send({ ownerId: staffBId });
      expect(assigned.status).toBe(200);
      expect(assigned.body.owner).toMatchObject({ id: staffBId });
      expect(assigned.body.currentStatus).toBe("OPEN");

      const repeat = await staff.post(`/api/staff/tickets/${id}/assign`).send({ ownerId: staffBId });
      expect(repeat.status).toBe(200);

      const unassigned = await staff.post(`/api/staff/tickets/${id}/assign`).send({ ownerId: null });
      expect(unassigned.status).toBe(200);
      expect(unassigned.body.owner).toBeNull();
      expect(unassigned.body.currentStatus).toBe("NEW");
    } finally {
      await cleanupTicket(id);
    }
  });

  it("rejects missing, inactive, and wrong-role targets", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      expect((await staff.post(`/api/staff/tickets/${id}/assign`).send({ ownerId: 999999 })).status).toBe(404);
      expect((await staff.post(`/api/staff/tickets/${id}/assign`).send({ ownerId: "x" })).status).toBe(400);
      const req = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", active: true } });
      const wrongRole = await staff.post(`/api/staff/tickets/${id}/assign`).send({ ownerId: req.id });
      expect(wrongRole.status).toBe(400);
      const stored = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(stored.ownerId).toBeNull();
    } finally {
      await cleanupTicket(id);
    }
  });
});

describe("priority + status (STOP-03, STOP-04, AC-16, AC-17)", () => {
  it("sets IT Priority for staff and 403s requesters", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      const res = await staff.patch(`/api/staff/tickets/${id}/priority`).send({ itPriority: "URGENT" });
      expect(res.status).toBe(200);
      expect(res.body.itPriority).toBe("URGENT");
      expect((await staff.patch(`/api/staff/tickets/${id}/priority`).send({ itPriority: "CRITICAL" })).status).toBe(400);
      expect((await requester.patch(`/api/staff/tickets/${id}/priority`).send({ itPriority: "LOW" })).status).toBe(403);
    } finally {
      await cleanupTicket(id);
    }
  });

  it("walks legal transitions and rejects off-matrix ones", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      const hop = async (status: string) => staff.patch(`/api/staff/tickets/${id}/status`).send({ status });
      expect((await hop("IN_PROGRESS")).status).toBe(400);
      expect((await hop("OPEN")).status).toBe(200);
      expect((await hop("IN_PROGRESS")).status).toBe(200);
      // Lab 4 resolution gate (BR-10): RESOLVED needs >=1 action.
      const gated = await staff.post(`/api/staff/tickets/${id}/actions`).send({
        description: "Walk-through action.",
        result: "Walk-through result.",
        followUpRequired: false,
      });
      expect(gated.status).toBe(201);
      expect((await hop("RESOLVED")).status).toBe(200);
      expect((await hop("IN_PROGRESS")).status).toBe(400);
      expect((await hop("CLOSED")).status).toBe(200);
      expect((await hop("REOPENED")).status).toBe(200);
      expect((await hop("CANCELLED")).status).toBe(200);
      expect((await hop("OPEN")).status).toBe(400);
      expect((await hop("WHENEVER")).status).toBe(400);
    } finally {
      await cleanupTicket(id);
    }
  });

  it("admins operate the same workflow", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      expect((await admin.post(`/api/staff/tickets/${id}/claim`)).status).toBe(200);
      expect((await admin.patch(`/api/staff/tickets/${id}/status`).send({ status: "IN_PROGRESS" })).status).toBe(200);
    } finally {
      await cleanupTicket(id);
    }
  });
});

describe("staff detail + notes (CN-02, AC-19)", () => {
  it("returns both channels, requester block, and read-only evidence", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "OPEN");
    try {
      await prisma.ticketComment.create({
        data: { ticketId: id, authorId: staffId, visibility: "INTERNAL", body: "ops-only note" },
      });
      const res = await staff.get(`/api/staff/tickets/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.requester.email).toBeTruthy();
      expect(res.body.owner).toMatchObject({ id: staffId });
      expect(res.body.notes.map((n: { body: string }) => n.body)).toContain("ops-only note");
      expect((await requester.get(`/api/staff/tickets/${id}`)).status).toBe(403);
    } finally {
      await cleanupTicket(id);
    }
  });

  it("posts staff public comments to the PUBLIC channel", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "OPEN");
    try {
      const posted = await staff.post(`/api/staff/tickets/${id}/comments`).send({ body: "looking into it" });
      expect(posted.status).toBe(201);
      expect(posted.body.authorRole).toBe("IT_STAFF");
      const detail = await staff.get(`/api/staff/tickets/${id}`);
      expect(detail.body.comments.map((c: { body: string }) => c.body)).toContain("looking into it");
      expect((await requester.post(`/api/staff/tickets/${id}/comments`).send({ body: "x" })).status).toBe(403);
    } finally {
      await cleanupTicket(id);
    }
  });

  it("posts notes with validation and freezes them on CANCELLED", async () => {
    const id = await makeOwnedTicket("stop-staff@example.test", "NEW");
    try {
      expect((await staff.post(`/api/staff/tickets/${id}/notes`).send({ body: "   " })).status).toBe(400);
      const posted = await staff.post(`/api/staff/tickets/${id}/notes`).send({ body: "check the logs" });
      expect(posted.status).toBe(201);
      expect(posted.body.authorRole).toBe("IT_STAFF");
      const listed = await staff.get(`/api/staff/tickets/${id}/notes`);
      expect(listed.body.map((n: { body: string }) => n.body)).toContain("check the logs");

      await staff.patch(`/api/staff/tickets/${id}/status`).send({ status: "CANCELLED" });
      expect((await staff.post(`/api/staff/tickets/${id}/notes`).send({ body: "too late" })).status).toBe(400);
    } finally {
      await cleanupTicket(id);
    }
  });
});

describe("staff attachment download (STOP-05, AC-31)", () => {
  it("serves active files, 410s removed ones, 404s missing ids", async () => {
    const attachment = await prisma.attachment.findFirst();
    if (!attachment) return;
    const active = await staff.get(`/api/staff/attachments/${attachment.id}/download`);
    if (!attachment.removedAt) {
      expect(active.status).toBe(200);
    } else {
      expect(active.status).toBe(410);
    }
    expect((await staff.get("/api/staff/attachments/999999/download")).status).toBe(404);
    expect((await requester.get(`/api/staff/attachments/${attachment.id}/download`)).status).toBe(403);
  });
});

describe("staff users directory (STOP-06)", () => {
  it("lists active staff and admins ordered by name", async () => {
    const res = await staff.get("/api/staff/users");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const user of res.body as { role: string }[]) {
      expect(["IT_STAFF", "ADMINISTRATOR"]).toContain(user.role);
    }
    const names = (res.body as { name: string }[]).map((u) => u.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect((await requester.get("/api/staff/users")).status).toBe(403);
  });
});
