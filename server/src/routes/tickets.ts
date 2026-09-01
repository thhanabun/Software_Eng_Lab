import { Router } from "express";
import { Prisma, RequestedPriority } from "@prisma/client";
import { prisma } from "../db";
import { generateTicketNumber } from "../lib/ticketNumber";

export const ticketsRouter: Router = Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const SUMMARY_MAX = 120;
const DESCRIPTION_MAX = 2000;
const NUMBER_ATTEMPTS = 5;

interface FieldError {
  field: string;
  message: string;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

const STATUSES = ["NEW"];
const PAGE_SIZES = [5, 10, 25];
const DEFAULT_PAGE_SIZE = 10;

const PRIORITY_RANK = Prisma.sql`CASE t."requestedPriority"::text WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'URGENT' THEN 4 ELSE 9 END`;

const SORTS: Record<string, Prisma.Sql> = {
  "createdAt:desc": Prisma.sql`t."createdAt" DESC`,
  "createdAt:asc": Prisma.sql`t."createdAt" ASC`,
  "updatedAt:desc": Prisma.sql`t."updatedAt" DESC`,
  "updatedAt:asc": Prisma.sql`t."updatedAt" ASC`,
  "summary:desc": Prisma.sql`t."summary" DESC`,
  "summary:asc": Prisma.sql`t."summary" ASC`,
  "requestedPriority:desc": Prisma.sql`${PRIORITY_RANK} DESC`,
  "requestedPriority:asc": Prisma.sql`${PRIORITY_RANK} ASC`,
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function queryString(req: { query: unknown }, name: string): string {
  const value = (req.query as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

interface TicketListRow {
  id: number;
  ticketNumber: string;
  summary: string;
  requestedPriority: string;
  currentStatus: string;
  categoryId: number;
  categoryName: string;
  createdAt: Date;
  updatedAt: Date;
}

ticketsRouter.get("/", async (req, res) => {
  const requesterId = toPositiveInt(req.headers["x-requester-id"]);
  if (requesterId === null) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Valid X-Requester-Id header is required",
        details: [{ field: "requesterId", message: "X-Requester-Id must be a positive integer" }],
      },
    });
    return;
  }

  const requester = await prisma.requesterUser.findUnique({ where: { id: requesterId } });
  if (!requester) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Requester not found" },
    });
    return;
  }

  const details: FieldError[] = [];

  const search = queryString(req, "search");

  const categoryIdRaw = queryString(req, "categoryId");
  let categoryId: number | null = null;
  if (categoryIdRaw) {
    categoryId = toPositiveInt(categoryIdRaw);
    if (categoryId === null) {
      details.push({ field: "categoryId", message: "categoryId must be a positive integer" });
    }
  }

  const status = queryString(req, "status");
  if (status && !STATUSES.includes(status)) {
    details.push({ field: "status", message: `status must be one of: ${STATUSES.join(", ")}` });
  }

  const priority = queryString(req, "priority");
  if (priority && !PRIORITIES.includes(priority)) {
    details.push({
      field: "priority",
      message: "priority must be LOW, MEDIUM, HIGH, or URGENT",
    });
  }

  const sort = queryString(req, "sort") || "createdAt:desc";
  if (!SORTS[sort]) {
    details.push({ field: "sort", message: "Invalid sort value" });
  }

  const pageRaw = queryString(req, "page") || "1";
  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 1) {
    details.push({ field: "page", message: "page must be a positive integer" });
  }

  const pageSizeRaw = queryString(req, "pageSize") || String(DEFAULT_PAGE_SIZE);
  const pageSize = Number(pageSizeRaw);
  if (!PAGE_SIZES.includes(pageSize)) {
    details.push({ field: "pageSize", message: "pageSize must be 5, 10, or 25" });
  }

  if (categoryId !== null) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) details.push({ field: "categoryId", message: "Category not found" });
  }

  if (details.length > 0) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid ticket list query",
        details,
      },
    });
    return;
  }

  const where: Prisma.Sql[] = [Prisma.sql`t."requesterId" = ${requesterId}`];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    where.push(Prisma.sql`(t."summary" ILIKE ${pattern} OR t."description" ILIKE ${pattern})`);
  }
  if (categoryId !== null) where.push(Prisma.sql`t."categoryId" = ${categoryId}`);
  if (status) where.push(Prisma.sql`t."currentStatus"::text = ${status}`);
  if (priority) where.push(Prisma.sql`t."requestedPriority"::text = ${priority}`);
  const whereSql = Prisma.join(where, " AND ");
  const orderSql = SORTS[sort];
  const offset = (page - 1) * pageSize;

  try {
    const [rows, totals] = await Promise.all([
      prisma.$queryRaw<TicketListRow[]>`
        SELECT t."id", t."ticketNumber", t."summary", t."requestedPriority", t."currentStatus",
               t."categoryId", c."name" AS "categoryName", t."createdAt", t."updatedAt"
        FROM "Ticket" t
        JOIN "Category" c ON c."id" = t."categoryId"
        WHERE ${whereSql}
        ORDER BY ${orderSql}, t."ticketNumber" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Ticket" t
        WHERE ${whereSql}
      `,
    ]);
    const totalItems = Number(totals[0]?.count ?? 0n);
    res.json({
      items: rows.map((row) => ({
        ...row,
        requestedPriority: String(row.requestedPriority),
        currentStatus: String(row.currentStatus),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    });
  } catch {
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unable to load tickets" },
    });
  }
});

ticketsRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const details: FieldError[] = [];
  const add = (field: string, message: string) => details.push({ field, message });

  const requesterId = toPositiveInt(body.requesterId);
  if (requesterId === null) add("requesterId", "Requester is required");

  const categoryId = toPositiveInt(body.categoryId);
  if (categoryId === null) add("categoryId", "Category is required");

  const relatedSystemId = toPositiveInt(body.relatedSystemId);
  if (relatedSystemId === null) add("relatedSystemId", "Related system is required");

  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (summary.length === 0) add("summary", "Summary is required");
  else if (summary.length > SUMMARY_MAX) add("summary", `Summary must be ${SUMMARY_MAX} characters or fewer`);

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length === 0) add("description", "Description is required");
  else if (description.length > DESCRIPTION_MAX)
    add("description", `Description must be ${DESCRIPTION_MAX} characters or fewer`);

  const requestedPriority = body.requestedPriority;
  if (typeof requestedPriority !== "string" || !PRIORITIES.includes(requestedPriority)) {
    add("requestedPriority", "Requested priority must be LOW, MEDIUM, HIGH, or URGENT");
  }

  if (requesterId !== null) {
    const requester = await prisma.requesterUser.findUnique({ where: { id: requesterId } });
    if (!requester) add("requesterId", "Requester not found");
    else if (!requester.active) add("requesterId", "Requester is not active");
  }

  if (categoryId !== null) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) add("categoryId", "Category not found");
  }

  if (relatedSystemId !== null) {
    const system = await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } });
    if (!system) add("relatedSystemId", "Related system not found");
    else if (!system.active) add("relatedSystemId", "Related system is not active");
  }

  if (details.length > 0) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Ticket payload is invalid",
        details,
      },
    });
    return;
  }

  try {
    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
      const ticketNumber = await generateTicketNumber(prisma, attempt);
      try {
        const ticket = await prisma.ticket.create({
          data: {
            ticketNumber,
            requesterId: requesterId as number,
            categoryId: categoryId as number,
            relatedSystemId: relatedSystemId as number,
            summary,
            description,
            requestedPriority: requestedPriority as RequestedPriority,
          },
        });
        res.status(201).json(ticket);
        return;
      } catch (err) {
        const isUnique =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isUnique) throw err;
      }
    }
    throw new Error("ticket number allocation exhausted");
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to create ticket",
      },
    });
  }
});
