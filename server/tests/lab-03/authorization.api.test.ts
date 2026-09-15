import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";
import { createLoginUser, loginAgent, type TestAgent } from "../helpers";

process.env.BCRYPT_COST = "4";

let app: Express;
let agentA: TestAgent;
let agentB: TestAgent;
let agentStaff: TestAgent;
let userA: number;
let userB: number;

async function createTicketAs(agent: TestAgent, summary: string): Promise<{ id: number; ticketNumber: string }> {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow();
  const res = await agent.post("/api/tickets").send({
    categoryId: category.id,
    relatedSystemId: system.id,
    summary,
    description: "authorization probe ticket",
    requestedPriority: "MEDIUM",
  });
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  userA = (await createLoginUser("authz-a@student.example", "Authz A")).id;
  userB = (await createLoginUser("authz-b@student.example", "Authz B")).id;
  await createLoginUser("authz-staff@example.test", "Authz Staff").then((u) =>
    prisma.user.update({ where: { id: u.id }, data: { role: "IT_STAFF" } }),
  );
  agentA = await loginAgent(app, "authz-a@student.example");
  agentB = await loginAgent(app, "authz-b@student.example");
  agentStaff = await loginAgent(app, "authz-staff@example.test");
});

describe("session identity over client-supplied ids (AUTHZ-01, AC-03, BR-03)", () => {
  it("ignores a spoofed requesterId and applies the session identity", async () => {
    const category = await prisma.category.findFirstOrThrow();
    const system = await prisma.relatedSystem.findFirstOrThrow();
    const res = await agentA.post("/api/tickets").send({
      requesterId: userB,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "spoof attempt",
      description: "client claims to be user B",
      requestedPriority: "LOW",
    });
    expect(res.status).toBe(201);
    expect(res.body.requesterId).toBe(userA);

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.requesterId).toBe(userA);
    await prisma.ticket.delete({ where: { id: res.body.id } });
  });
});

describe("requester isolation (AUTHZ-05, BR-12)", () => {
  it("returns 404 for another requester's ticket, comments, and attachments", async () => {
    const ticket = await createTicketAs(agentA, "A private ticket");
    try {
      expect((await agentB.get(`/api/tickets/${ticket.id}`)).status).toBe(404);
      expect((await agentB.get(`/api/tickets/${ticket.id}/comments`)).status).toBe(404);
      const comment = await agentB.post(`/api/tickets/${ticket.id}/comments`).send({ body: "hi" });
      expect(comment.status).toBe(404);
      const indicate = await agentB.post(`/api/tickets/${ticket.id}/resolved-indication`);
      expect(indicate.status).toBe(404);
    } finally {
      await prisma.ticketComment.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticket.delete({ where: { id: ticket.id } });
    }
  });
});

describe("absent routes stay silent (AUTHZ-02)", () => {
  it("requester probing future notes paths gets safe 404s with no content", async () => {
    for (const [method, path, body] of [
      ["get", "/api/tickets/1/notes", undefined],
      ["post", "/api/tickets/1/notes", { body: "x" }],
    ] as const) {
      const res = body === undefined
        ? await agentA[method](path)
        : await agentA[method](path).send(body);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(JSON.stringify(res.body)).not.toMatch(/note|password|token/i);
    }
  });

  it("requester is forbidden on live staff ops and admin APIs (AUTHZ-03, AUTHZ-04)", async () => {
    expect((await agentA.post("/api/staff/tickets/1/claim")).status).toBe(403);
    expect((await agentA.get("/api/staff/attachments/1/download")).status).toBe(403);
    expect((await agentA.post("/api/staff/tickets/1/comments").send({ body: "x" })).status).toBe(403);
    expect((await agentA.get("/api/staff/tickets/1/notes")).status).toBe(403);
    expect((await agentA.get("/api/admin/users")).status).toBe(403);
    expect((await agentA.post("/api/admin/users").send({})).status).toBe(403);
    expect(JSON.stringify((await agentA.get("/api/admin/users")).body)).not.toMatch(/password|hash|token/i);
  });
});

describe("logged-out access (AUTHZ-06)", () => {
  it("rejects every protected route class with 401", async () => {
    const anon = request(app);
    for (const [method, path, body] of [
      ["get", "/api/tickets", undefined],
      ["post", "/api/tickets", {}],
      ["get", "/api/tickets/1", undefined],
      ["get", "/api/tickets/1/comments", undefined],
      ["post", "/api/tickets/1/comments", { body: "x" }],
      ["get", "/api/attachments/1", undefined],
      ["get", "/api/auth/me", undefined],
    ] as const) {
      const res = body === undefined ? await anon[method](path) : await anon[method](path).send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });
});

describe("requester detail never carries notes (AUTHZ-07, AC-19, BR-04)", () => {
  it("embeds public comments but exposes no notes key", async () => {
    const ticket = await createTicketAs(agentA, "ticket with both channels");
    try {
      const staff = await prisma.user.findFirstOrThrow({ where: { role: "IT_STAFF", active: true } });
      await prisma.ticketComment.create({
        data: { ticketId: ticket.id, authorId: staff.id, visibility: "INTERNAL", body: "staff-only note" },
      });
      await agentA.post(`/api/tickets/${ticket.id}/comments`).send({ body: "public hello" });

      const res = await agentA.get(`/api/tickets/${ticket.id}`);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("notes");
      expect(JSON.stringify(res.body)).not.toContain("staff-only note");
      expect(res.body.comments.map((c: { body: string }) => c.body)).toContain("public hello");
    } finally {
      await prisma.ticketComment.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticket.delete({ where: { id: ticket.id } });
    }
  });
});

describe("public comments + resolved indication (CN-01, CN-03, AC-18, AC-20)", () => {
  it("posts and lists public comments with server author/time", async () => {
    const ticket = await createTicketAs(agentA, "commentable ticket");
    try {
      const bad = await agentA.post(`/api/tickets/${ticket.id}/comments`).send({ body: "   " });
      expect(bad.status).toBe(400);
      const posted = await agentA.post(`/api/tickets/${ticket.id}/comments`).send({ body: "first public line" });
      expect(posted.status).toBe(201);
      expect(posted.body.authorName).toBe("Authz A");
      expect(posted.body.authorRole).toBe("REQUESTER");

      const listed = await agentA.get(`/api/tickets/${ticket.id}/comments`);
      expect(listed.status).toBe(200);
      expect(listed.body.map((c: { body: string }) => c.body)).toContain("first public line");
    } finally {
      await prisma.ticketComment.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticket.delete({ where: { id: ticket.id } });
    }
  });

  it("records the appears-resolved indication without changing status", async () => {
    const ticket = await createTicketAs(agentA, "indicatable ticket");
    try {
      // NEW is not indicatable.
      expect((await agentA.post(`/api/tickets/${ticket.id}/resolved-indication`)).status).toBe(400);
      await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: "IN_PROGRESS" } });

      const first = await agentA.post(`/api/tickets/${ticket.id}/resolved-indication`);
      expect(first.status).toBe(200);
      expect(first.body.requesterResolved).toBe(true);

      const repeat = await agentA.post(`/api/tickets/${ticket.id}/resolved-indication`);
      expect(repeat.status).toBe(200);

      const detail = await agentA.get(`/api/tickets/${ticket.id}`);
      expect(detail.body.currentStatus).toBe("IN_PROGRESS");
      expect(detail.body.requesterResolved).toBe(true);
      expect(detail.body.comments.map((c: { body: string }) => c.body)).toContain(
        "Requester indicated the problem appears resolved.",
      );
    } finally {
      await prisma.ticketComment.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticket.delete({ where: { id: ticket.id } });
    }
  });
});

describe("Lab 2 regression under cookie identity (RREG-01, AC-12)", () => {
  it("create/list/detail/attachments behave as Lab 2 with session ownership", async () => {
    const created = await createTicketAs(agentA, "regression ticket");
    expect(created.ticketNumber).toMatch(/^TKT-\d{8}-\d{4}$/);

    const list = await agentA.get("/api/tickets");
    expect(list.status).toBe(200);
    expect(list.body.items.map((t: { id: number }) => t.id)).toContain(created.id);
    const listB = await agentB.get("/api/tickets");
    expect(listB.body.items.map((t: { id: number }) => t.id)).not.toContain(created.id);

    const detail = await agentA.get(`/api/tickets/${created.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.attachments).toEqual([]);

    expect((await agentStaff.get(`/api/tickets/${created.id}`)).status).toBe(403);
    await prisma.ticket.delete({ where: { id: created.id } });
  });
});
