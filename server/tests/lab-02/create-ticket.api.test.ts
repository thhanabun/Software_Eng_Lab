import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { UPLOADS_DIR } from "../../src/lib/attachments";

const validPayload = (requesterId: number) => ({
  requesterId,
  categoryId: 2,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "Battery drops from 100% to 20% within one hour of unplugging.",
  requestedPriority: "MEDIUM",
});

let requesterId: number;
let inactiveRequesterId: number;
const createdTicketIds: number[] = [];

beforeAll(async () => {
  const active = await prisma.requesterUser.findFirst({ where: { active: true } });
  const inactive = await prisma.requesterUser.findFirst({ where: { active: false } });
  if (!active || !inactive) throw new Error("seed must provide active and inactive requesters");
  requesterId = active.id;
  inactiveRequesterId = inactive.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
});

describe("POST /api/tickets (API-03)", () => {
  it("creates a ticket and returns the official backend-generated number", async () => {
    const res = await request(createApp()).post("/api/tickets").send(validPayload(requesterId));

    expect(res.status).toBe(201);
    createdTicketIds.push(res.body.id);

    expect(res.body.ticketNumber).toMatch(/^TKT-\d{8}-\d{4}$/);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.requesterId).toBe(requesterId);
    expect(res.body.requestedPriority).toBe("MEDIUM");
    expect(res.body.summary).toBe("Laptop battery drains quickly");
    expect(new Date(res.body.createdAt).toString()).not.toBe("Invalid Date");

    const stored = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(stored).not.toBeNull();
    expect(stored?.ticketNumber).toBe(res.body.ticketNumber);
  });

  it("trims summary and description before storing", async () => {
    const payload = {
      ...validPayload(requesterId),
      summary: "   Printer jam on floor 2   ",
      description: "   The printer shows E-52 repeatedly.   ",
    };
    const res = await request(createApp()).post("/api/tickets").send(payload);

    expect(res.status).toBe(201);
    createdTicketIds.push(res.body.id);
    expect(res.body.summary).toBe("Printer jam on floor 2");
    expect(res.body.description).toBe("The printer shows E-52 repeatedly.");
  });
});

describe("POST /api/tickets validation (API-04)", () => {
  it("rejects missing required fields with field-level details and saves nothing", async () => {
    const before = await prisma.ticket.count();
    const res = await request(createApp()).post("/api/tickets").send({
      requestedPriority: "MEDIUM",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    for (const expected of ["requesterId", "categoryId", "relatedSystemId", "summary", "description"]) {
      expect(fields).toContain(expected);
    }
    expect(await prisma.ticket.count()).toBe(before);
  });

  it("rejects over-length and empty-after-trim text fields", async () => {
    const res = await request(createApp()).post("/api/tickets").send({
      ...validPayload(requesterId),
      summary: "   ",
      description: "x".repeat(2001),
    });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("summary");
    expect(fields).toContain("description");
  });

  it("rejects unknown category, related system, and invalid priority", async () => {
    const res = await request(createApp()).post("/api/tickets").send({
      ...validPayload(requesterId),
      categoryId: 999999,
      relatedSystemId: 999999,
      requestedPriority: "WHENEVER",
    });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("categoryId");
    expect(fields).toContain("relatedSystemId");
    expect(fields).toContain("requestedPriority");
  });
});

describe("POST /api/tickets length boundaries (API-04b, BR-09/BR-10)", () => {
  it("accepts a summary of exactly 120 and a description of exactly 2000 characters", async () => {
    const res = await request(createApp())
      .post("/api/tickets")
      .send({
        ...validPayload(requesterId),
        summary: "s".repeat(120),
        description: "d".repeat(2000),
      });

    expect(res.status).toBe(201);
    createdTicketIds.push(res.body.id);
    expect(res.body.summary).toHaveLength(120);
  });

  it("rejects a summary of 121 characters with a summary field detail", async () => {
    const res = await request(createApp())
      .post("/api/tickets")
      .send({ ...validPayload(requesterId), summary: "s".repeat(121) });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("summary");
  });

  it("accepts the exact 5-attachment limit and rejects the sixth (BR-17 boundary)", async () => {
    const created = await request(createApp())
      .post("/api/tickets")
      .send(validPayload(requesterId));
    createdTicketIds.push(created.body.id);

    let filesStored = 0;
    for (let i = 1; i <= 5; i++) {
      const res = await request(createApp())
        .post(`/api/tickets/${created.body.id}/attachments`)
        .set("X-Requester-Id", String(requesterId))
        .attach(
          "file",
          Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          { filename: `bound-${i}.png`, contentType: "image/png" },
        );
      if (res.status === 201) filesStored += 1;
    }
    expect(filesStored).toBe(5);

    const attachments = await prisma.attachment.findMany({ where: { ticketId: created.body.id } });
    for (const attachment of attachments) {
      fs.rmSync(path.join(UPLOADS_DIR, attachment.storedName), { force: true });
    }
    await prisma.attachment.deleteMany({ where: { ticketId: created.body.id } });
  });
});

describe("POST /api/tickets uniqueness (API-05)", () => {
  it("generates a unique number for each ticket created the same day", async () => {
    const first = await request(createApp()).post("/api/tickets").send(validPayload(requesterId));
    const second = await request(createApp()).post("/api/tickets").send(validPayload(requesterId));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    createdTicketIds.push(first.body.id, second.body.id);
    expect(first.body.ticketNumber).not.toBe(second.body.ticketNumber);
  });
});

describe("POST /api/tickets inactive requester (API-06)", () => {
  it("rejects ticket creation for an inactive requester", async () => {
    const before = await prisma.ticket.count();
    const res = await request(createApp()).post("/api/tickets").send(validPayload(inactiveRequesterId));

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("requesterId");
    expect(await prisma.ticket.count()).toBe(before);
  });
});
