import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, requireFreshPassword, requireRole } from "../lib/auth";
import { internalError } from "../lib/validation";

export const staffTicketsRouter: Router = Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];
const PAGE_SIZES = [5, 10, 25];
const DEFAULT_PAGE_SIZE = 10;

interface FieldError {
  field: string;
  message: string;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function queryString(req: { query: unknown }, name: string): string {
  const value = (req.query as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const REQ_RANK = Prisma.sql`CASE t."requestedPriority"::text WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'URGENT' THEN 4 ELSE 9 END`;
const IT_RANK = Prisma.sql`CASE t."itPriority"::text WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'URGENT' THEN 4 ELSE 9 END`;

const SORTS: Record<string, Prisma.Sql> = {
  "createdAt:desc": Prisma.sql`t."createdAt" DESC`,
  "createdAt:asc": Prisma.sql`t."createdAt" ASC`,
  "updatedAt:desc": Prisma.sql`t."updatedAt" DESC`,
  "updatedAt:asc": Prisma.sql`t."updatedAt" ASC`,
  "requestedPriority:desc": Prisma.sql`${REQ_RANK} DESC`,
  "requestedPriority:asc": Prisma.sql`${REQ_RANK} ASC`,
  "itPriority:desc": Prisma.sql`${IT_RANK} DESC`,
  "itPriority:asc": Prisma.sql`${IT_RANK} ASC`,
  "ticketNumber:desc": Prisma.sql`t."ticketNumber" DESC`,
  "ticketNumber:asc": Prisma.sql`t."ticketNumber" ASC`,
};

interface QueueRow {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  ownerName: string | null;
  requesterName: string;
  createdAt: Date;
  updatedAt: Date;
}

// GET /api/staff/tickets — shared queue (IT_STAFF, ADMINISTRATOR).
// Default oldest-first (FIFO, AD-07), secondary ticketNumber ascending.
staffTicketsRouter.get(
  "/",
  requireAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  requireFreshPassword,
  async (req, res) => {
    const details: FieldError[] = [];
    const search = queryString(req, "search");

    const status = queryString(req, "status");
    if (status && !STATUSES.includes(status)) {
      details.push({ field: "status", message: `status must be one of: ${STATUSES.join(", ")}` });
    }

    const categoryIdRaw = queryString(req, "categoryId");
    let categoryId: number | null = null;
    if (categoryIdRaw) {
      categoryId = toPositiveInt(categoryIdRaw);
      if (categoryId === null) details.push({ field: "categoryId", message: "categoryId must be a positive integer" });
    }

    const requestedPriority = queryString(req, "requestedPriority");
    if (requestedPriority && !PRIORITIES.includes(requestedPriority)) {
      details.push({ field: "requestedPriority", message: "requestedPriority must be LOW, MEDIUM, HIGH, or URGENT" });
    }

    const itPriority = queryString(req, "itPriority");
    if (itPriority && !PRIORITIES.includes(itPriority)) {
      details.push({ field: "itPriority", message: "itPriority must be LOW, MEDIUM, HIGH, or URGENT" });
    }

    const ownerRaw = queryString(req, "ownerId");
    let ownerId: number | "unassigned" | null = null;
    if (ownerRaw) {
      if (ownerRaw === "unassigned") {
        ownerId = "unassigned";
      } else {
        const parsed = toPositiveInt(ownerRaw);
        if (parsed === null) {
          details.push({ field: "ownerId", message: 'ownerId must be a positive integer or "unassigned"' });
        } else {
          ownerId = parsed;
        }
      }
    }

    const sort = queryString(req, "sort") || "createdAt:asc";
    if (!SORTS[sort]) details.push({ field: "sort", message: "Invalid sort value" });

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
    if (ownerId !== null && ownerId !== "unassigned") {
      const owner = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner) details.push({ field: "ownerId", message: "Owner not found" });
    }

    if (details.length > 0) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid queue query", details },
      });
      return;
    }

    const where: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      where.push(
        Prisma.sql`(t."ticketNumber" ILIKE ${pattern} OR t."summary" ILIKE ${pattern} OR t."description" ILIKE ${pattern})`,
      );
    }
    if (status) where.push(Prisma.sql`t."currentStatus"::text = ${status}`);
    if (categoryId !== null) where.push(Prisma.sql`t."categoryId" = ${categoryId}`);
    if (requestedPriority) where.push(Prisma.sql`t."requestedPriority"::text = ${requestedPriority}`);
    if (itPriority) where.push(Prisma.sql`t."itPriority"::text = ${itPriority}`);
    if (ownerId === "unassigned") where.push(Prisma.sql`t."ownerId" IS NULL`);
    if (typeof ownerId === "number") where.push(Prisma.sql`t."ownerId" = ${ownerId}`);
    const whereSql = Prisma.join(where, " AND ");
    const orderSql = SORTS[sort];
    const offset = (page - 1) * pageSize;

    try {
      const [rows, totals] = await Promise.all([
        prisma.$queryRaw<QueueRow[]>`
          SELECT t."id", t."ticketNumber", t."summary", c."name" AS "categoryName",
                 t."requestedPriority", t."itPriority", t."currentStatus",
                 o."name" AS "ownerName", r."name" AS "requesterName",
                 t."createdAt", t."updatedAt"
          FROM "Ticket" t
          JOIN "Category" c ON c."id" = t."categoryId"
          JOIN "User" r ON r."id" = t."requesterId"
          LEFT JOIN "User" o ON o."id" = t."ownerId"
          WHERE ${whereSql}
          ORDER BY ${orderSql}, t."ticketNumber" ASC
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
          id: row.id,
          ticketNumber: row.ticketNumber,
          summary: row.summary,
          categoryName: row.categoryName,
          requestedPriority: String(row.requestedPriority),
          itPriority: String(row.itPriority),
          currentStatus: String(row.currentStatus),
          owner: row.ownerName,
          requesterName: row.requesterName,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      });
    } catch {
      internalError(res, "Unable to load ticket queue");
    }
  },
);
