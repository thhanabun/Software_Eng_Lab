import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";
import { createLoginUser, loginAgent, type TestAgent } from "../helpers";

let app: Express;
let owner: number;
let stranger: number;
let ticketId: number;
let ownerAgent: TestAgent;
let strangerAgent: TestAgent;

async function makeTicket(): Promise<{ id: number; ticketNumber: string }> {
  const hardware = await prisma.category.findUniqueOrThrow({ where: { name: "Hardware" } });
  const laptop = await prisma.relatedSystem.findUniqueOrThrow({
    where: { name: "Corporate Laptop" },
  });
  const res = await ownerAgent
    .post("/api/tickets")
    .send({
      categoryId: hardware.id,
      relatedSystemId: laptop.id,
      summary: "Battery drains within an hour",
      description: "The laptop dies quickly when unplugged.",
      requestedPriority: "HIGH",
    });
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  owner = (await createLoginUser("detail-owner@student.example", "Detail Owner")).id;
  stranger = (await createLoginUser("detail-stranger@student.example", "Detail Stranger")).id;
  ownerAgent = await loginAgent(app, "detail-owner@student.example");
  strangerAgent = await loginAgent(app, "detail-stranger@student.example");
  ticketId = (await makeTicket()).id;
});

async function cleanup() {
  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [owner, stranger] } } },
  });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [owner, stranger] } } });
}

afterAll(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
});

describe("GET /api/tickets/:id (API-14..16)", () => {
  it("returns the full detail for the owner, including names and attachments array", async () => {
    const res = await ownerAgent
      .get(`/api/tickets/${ticketId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticketId);
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{8}-\d{4}$/);
    expect(res.body.summary).toBe("Battery drains within an hour");
    expect(res.body.description).toBe("The laptop dies quickly when unplugged.");
    expect(res.body.requestedPriority).toBe("HIGH");
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.categoryName).toBe("Hardware");
    expect(res.body.relatedSystemName).toBe("Corporate Laptop");
    expect(res.body.requesterName).toBe("Detail Owner");
    expect(Array.isArray(res.body.attachments)).toBe(true);
    expect(res.body.attachments).toEqual([]);
  });

  it("returns the same safe 404 for another requester's ticket and for missing ids (API-15)", async () => {
    const foreign = await strangerAgent
      .get(`/api/tickets/${ticketId}`);
    expect(foreign.status).toBe(404);

    const missing = await ownerAgent
      .get("/api/tickets/987654");
    expect(missing.status).toBe(404);

    const badId = await ownerAgent
      .get("/api/tickets/not-a-number");
    expect(badId.status).toBe(404);

    expect(foreign.body.error.message).toBe(missing.body.error.message);
    expect(foreign.body.error.message).toBe(badId.body.error.message);
  });

  it("rejects missing or invalid sessions with 401 (API-16)", async () => {
    const missing = await request(app).get(`/api/tickets/${ticketId}`);
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("UNAUTHENTICATED");

    const invalid = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Cookie", "toktickit_session=deadbeef");
    expect(invalid.status).toBe(401);
  });
});
