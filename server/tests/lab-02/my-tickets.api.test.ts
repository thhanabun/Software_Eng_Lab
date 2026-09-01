import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";

interface ListBody {
  items: Array<{
    id: number;
    ticketNumber: string;
    summary: string;
    requestedPriority: string;
    currentStatus: string;
    categoryId: number;
    categoryName: string;
    createdAt: string;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

let app: Express;
let requesterA: number;
let requesterB: number;
let hardware: number;
let network: number;
let email: number;

function list(headers: Record<string, string> = {}) {
  return request(app).get("/api/tickets").set({ "X-Requester-Id": String(requesterA), ...headers });
}

async function createTicket(
  requesterId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; ticketNumber: string }> {
  const res = await request(app)
    .post("/api/tickets")
    .send({
      requesterId,
      categoryId: hardware,
      relatedSystemId: email,
      summary: `Baseline ticket ${Date.now()} ${Math.random()}`,
      description: "Baseline description for list tests",
      requestedPriority: "MEDIUM",
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  hardware = (await prisma.category.findUniqueOrThrow({ where: { name: "Hardware" } })).id;
  network = (await prisma.category.findUniqueOrThrow({ where: { name: "Network" } })).id;
  email = (await prisma.relatedSystem.findUniqueOrThrow({ where: { name: "Email" } })).id;

  const a = await prisma.requesterUser.upsert({
    where: { email: "list-a@student.example" },
    update: { active: true },
    create: { name: "List Tester A", email: "list-a@student.example", active: true },
  });
  const b = await prisma.requesterUser.upsert({
    where: { email: "list-b@student.example" },
    update: { active: true },
    create: { name: "List Tester B", email: "list-b@student.example", active: true },
  });
  requesterA = a.id;
  requesterB = b.id;
});

async function cleanupTickets() {
  await prisma.attachment.deleteMany({
    where: { ticket: { requesterId: { in: [requesterA, requesterB] } } },
  });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA, requesterB] } } });
}

beforeEach(cleanupTickets);

afterAll(async () => {
  await cleanupTickets();
  await prisma.requesterUser.deleteMany({ where: { id: { in: [requesterA, requesterB] } } });
});

describe("GET /api/tickets ownership (API-07)", () => {
  it("returns only the selected requester's tickets", async () => {
    await createTicket(requesterA, { summary: "Owned by A one" });
    await createTicket(requesterA, { summary: "Owned by A two" });
    await createTicket(requesterB, { summary: "Owned by B" });

    const resA = await list();
    expect(resA.status).toBe(200);
    const bodyA = resA.body as ListBody;
    expect(bodyA.totalItems).toBe(2);
    expect(bodyA.items.map((t) => t.summary).sort()).toEqual(["Owned by A one", "Owned by A two"]);

    const resB = await list({ "X-Requester-Id": String(requesterB) });
    expect((resB.body as ListBody).totalItems).toBe(1);
  });

  it("rejects missing and invalid X-Requester-Id with 400", async () => {
    const missing = await request(app).get("/api/tickets");
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");
    expect(missing.body.error.details[0].field).toBe("requesterId");

    const invalid = await list({ "X-Requester-Id": "not-a-number" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details[0].field).toBe("requesterId");
  });

  it("returns 404 for an unknown requester", async () => {
    const res = await list({ "X-Requester-Id": "999999" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/tickets search (API-08)", () => {
  it("is a case-insensitive substring over summary and description only", async () => {
    const target = await createTicket(requesterA, {
      summary: "Printer jam on floor 2",
      description: "the INK CARTRIDGE sticks every morning",
    });
    await createTicket(requesterA, { summary: "Battery drains fast", description: "unrelated" });

    const bySummary = await list().query({ search: "PRINTER jam" });
    expect(bySummary.status).toBe(200);
    expect((bySummary.body as ListBody).items.map((t) => t.id)).toEqual([target.id]);

    const byDescription = await list().query({ search: "cartridge" });
    expect((byDescription.body as ListBody).items.map((t) => t.id)).toEqual([target.id]);

    const byNumber = await list().query({ search: target.ticketNumber });
    expect((byNumber.body as ListBody).totalItems).toBe(0);

    const emptySearch = await list().query({ search: "   " });
    expect((emptySearch.body as ListBody).totalItems).toBe(2);
  });
});

describe("GET /api/tickets filters (API-09)", () => {
  it("filters by categoryId, status and priority, including combinations", async () => {
    await createTicket(requesterA, { summary: "Network one", categoryId: network, requestedPriority: "URGENT" });
    await createTicket(requesterA, { summary: "Hardware one", categoryId: hardware, requestedPriority: "LOW" });
    await createTicket(requesterA, { summary: "Hardware urgent", categoryId: hardware, requestedPriority: "URGENT" });

    const byCategory = await list().query({ categoryId: String(network) });
    expect((byCategory.body as ListBody).items.map((t) => t.summary)).toEqual(["Network one"]);

    const byStatus = await list().query({ status: "NEW" });
    expect((byStatus.body as ListBody).totalItems).toBe(3);

    const byPriority = await list().query({ priority: "URGENT" });
    expect((byPriority.body as ListBody).items.map((t) => t.summary).sort()).toEqual([
      "Hardware urgent",
      "Network one",
    ]);

    const combined = await list().query({ categoryId: String(hardware), priority: "URGENT" });
    expect((combined.body as ListBody).items.map((t) => t.summary)).toEqual(["Hardware urgent"]);
  });
});

describe("GET /api/tickets sorting (API-10)", () => {
  it("defaults to newest first, supports allowed sorts with stable secondary order, rejects invalid", async () => {
    await createTicket(requesterA, { summary: "Oldest entry" });
    await createTicket(requesterA, { summary: "Middle entry" });
    await createTicket(requesterA, { summary: "Priority urgent", requestedPriority: "URGENT" });
    await createTicket(requesterA, { summary: "Priority low", requestedPriority: "LOW" });
    await createTicket(requesterA, { summary: "Priority medium", requestedPriority: "MEDIUM" });
    await createTicket(requesterA, { summary: "Priority high", requestedPriority: "HIGH" });

    const newestFirst = await list();
    const ordered = (newestFirst.body as ListBody).items;
    expect(ordered[0].summary).toBe("Priority high");
    expect(ordered.at(-1)?.summary).toBe("Oldest entry");

    const oldest = await list().query({ sort: "createdAt:asc" });
    expect((oldest.body as ListBody).items[0].summary).toBe("Oldest entry");

    const summaryAsc = await list().query({ sort: "summary:asc" });
    const summaries = (summaryAsc.body as ListBody).items.map((t) => t.summary);
    expect([...summaries].sort((a, b) => a.localeCompare(b))).toEqual(summaries);

    const priorityAsc = await list().query({ sort: "requestedPriority:asc", search: "Priority " });
    expect((priorityAsc.body as ListBody).items.map((t) => t.requestedPriority)).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
      "URGENT",
    ]);

    const priorityDesc = await list().query({ sort: "requestedPriority:desc", search: "Priority " });
    expect((priorityDesc.body as ListBody).items.map((t) => t.requestedPriority)).toEqual([
      "URGENT",
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);

    const invalid = await list().query({ sort: "requesterId:asc" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details[0].field).toBe("sort");
  });
});

describe("GET /api/tickets pagination (API-11, API-12, API-13)", () => {
  it("slices pages, honours pageSize {5,10,25} and reports metadata", async () => {
    for (let i = 0; i < 12; i++) {
      await createTicket(requesterA, { summary: `Paged ticket ${String(i + 1).padStart(2, "0")}` });
    }

    const page1 = await list().query({ pageSize: "5" });
    expect(page1.status).toBe(200);
    expect((page1.body as ListBody).items).toHaveLength(5);
    expect(page1.body).toMatchObject({ page: 1, pageSize: 5, totalItems: 12, totalPages: 3 });

    const page2 = await list().query({ pageSize: "5", page: "2" });
    const ids = new Set([
      ...(page1.body as ListBody).items.map((t) => t.id),
      ...(page2.body as ListBody).items.map((t) => t.id),
    ]);
    expect(ids.size).toBe(10);

    const defaultSize = await list();
    expect((defaultSize.body as ListBody).items).toHaveLength(10);

    const large = await list().query({ pageSize: "25" });
    expect((large.body as ListBody).items).toHaveLength(12);

    const outOfRange = await list().query({ page: "9" });
    expect(outOfRange.status).toBe(200);
    expect((outOfRange.body as ListBody).items).toEqual([]);
    expect(outOfRange.body).toMatchObject({ page: 9, totalItems: 12, totalPages: 2 });
  });

  it("rejects invalid query values with 400 but ignores unknown params", async () => {
    await createTicket(requesterA, { summary: "One row" });

    const badPage = await list().query({ page: "0" });
    expect(badPage.status).toBe(400);
    expect(badPage.body.error.details[0].field).toBe("page");

    const badPageSize = await list().query({ pageSize: "7" });
    expect(badPageSize.status).toBe(400);
    expect(badPageSize.body.error.details[0].field).toBe("pageSize");

    const badStatus = await list().query({ status: "SOMETHING_ELSE" });
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.error.details[0].field).toBe("status");

    const badCategory = await list().query({ categoryId: "999999" });
    expect(badCategory.status).toBe(400);
    expect(badCategory.body.error.details[0].field).toBe("categoryId");

    const unknown = await list().query({ utm_source: "lab", page: "1" });
    expect(unknown.status).toBe(200);
    expect((unknown.body as ListBody).totalItems).toBe(1);
  });

  it("returns an empty list with zero totals when the requester has no tickets (API-13)", async () => {
    const res = await list({ "X-Requester-Id": String(requesterB) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], page: 1, totalItems: 0 });
    expect((res.body as ListBody).totalPages).toBeLessThanOrEqual(1);
  });
});
