import { Router, type Request, type Response } from "express";
import { Prisma, RequestedPriority } from "@prisma/client";
import { prisma } from "../db";
import { generateTicketNumber } from "../lib/ticketNumber";
import { requireActive, requireAuth, requireFreshPassword, requireRequesterRole } from "../lib/auth";
import { internalError, notFound, parsePositiveIntParam, validationError } from "../lib/validation";
import { attachmentMeta, sortAttachments } from "./ticketAttachments";

export const ticketsRouter: Router = Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const SUMMARY_MAX = 120;
const DESCRIPTION_MAX = 2000;
const COMMENT_MAX = 2000;
const NUMBER_ATTEMPTS = 5;
const INDICATABLE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"];

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

// Requester chains: reads keep working for inactive accounts (audit
// retention, api-spec S2); every write additionally requires an active
// account. Identity always comes from the session (BR-03).
const requesterRead = [requireAuth, requireRequesterRole, requireFreshPassword];
const requesterWrite = [requireAuth, requireRequesterRole, requireActive, requireFreshPassword];

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

interface CommentRow {
  id: number;
  body: string;
  authorName: string;
  authorRole: string;
  createdAt: Date;
}

async function publicComments(ticketId: number): Promise<CommentRow[]> {
  const rows = await prisma.ticketComment.findMany({
    where: { ticketId, visibility: "PUBLIC" },
    include: { author: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    authorName: c.author.name,
    authorRole: c.author.role,
    createdAt: c.createdAt,
  }));
}

function serializeComments(rows: CommentRow[]) {
  return rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }));
}

ticketsRouter.get("/:id", ...requesterRead, async (req, res) => {
  const requesterId = req.user!.id;

  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id, requesterId },
      include: {
        category: true,
        relatedSystem: true,
        requester: true,
        owner: true,
        attachments: true,
      },
    });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }

    // Internal notes are never included in requester payloads (BR-04).
    const comments = await publicComments(ticket.id);
    const { category, relatedSystem, requester, owner, attachments, ...fields } = ticket;
    res.json({
      ...fields,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      requesterResolvedAt: ticket.requesterResolvedAt ? ticket.requesterResolvedAt.toISOString() : null,
      categoryName: category.name,
      relatedSystemName: relatedSystem.name,
      requesterName: requester.name,
      owner: owner ? { id: owner.id, name: owner.name } : null,
      attachments: sortAttachments(attachments).map(attachmentMeta),
      comments: serializeComments(comments),
    });
  } catch {
    internalError(res, "Unable to load ticket");
  }
});

ticketsRouter.get("/", ...requesterRead, async (req, res) => {
  const requesterId = req.user!.id;

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
    internalError(res, "Unable to load tickets");
  }
});

ticketsRouter.post("/", ...requesterWrite, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const details: FieldError[] = [];
  const add = (field: string, message: string) => details.push({ field, message });

  // BR-03: ownership comes from the session; a client-supplied requesterId
  // (the Lab 2 field) is ignored, never trusted.
  const requesterId = req.user!.id;

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
            requesterId,
            categoryId: categoryId as number,
            relatedSystemId: relatedSystemId as number,
            summary,
            description,
            requestedPriority: requestedPriority as RequestedPriority,
            // IT Priority starts as a copy of Requested Priority (BR-15).
            itPriority: requestedPriority as RequestedPriority,
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
    internalError(res, "Unable to create ticket");
  }
});

async function ownedTicket(req: Request, res: Response) {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return null;
  }
  const ticket = await prisma.ticket.findFirst({ where: { id, requesterId: req.user!.id } });
  if (!ticket) {
    notFound(res, "Ticket not found");
    return null;
  }
  return ticket;
}

ticketsRouter.get("/:id/comments", ...requesterRead, async (req, res) => {
  try {
    const ticket = await ownedTicket(req, res);
    if (!ticket) return;
    res.json(serializeComments(await publicComments(ticket.id)));
  } catch {
    internalError(res, "Unable to load comments");
  }
});

ticketsRouter.post("/:id/comments", ...requesterWrite, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) {
    validationError(res, "Comment body is required", "body", "Comment must not be empty");
    return;
  }
  if (text.length > COMMENT_MAX) {
    validationError(res, "Comment is too long", "body", `Comment must be ${COMMENT_MAX} characters or fewer`);
    return;
  }

  try {
    const ticket = await ownedTicket(req, res);
    if (!ticket) return;
    if (ticket.currentStatus === "CANCELLED") {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Ticket is cancelled", details: [{ field: "ticket", message: "Comments cannot be added to a cancelled ticket" }] },
      });
      return;
    }
    const created = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, authorId: req.user!.id, visibility: "PUBLIC", body: text },
      include: { author: true },
    });
    res.status(201).json({
      id: created.id,
      body: created.body,
      authorName: created.author.name,
      authorRole: created.author.role,
      createdAt: created.createdAt.toISOString(),
    });
  } catch {
    internalError(res, "Unable to post comment");
  }
});

// GET /api/tickets/:id/actions — list (owned tickets for requesters,
// any ticket for staff/admin; read-only for requesters).
// Path does not imply authorization: identical role/ownership rules as the
// staff path, enforced here by branching on role after auth.
ticketsRouter.get("/:id/actions", requireAuth, requireFreshPassword, async (req, res) => {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (id === null) {
      notFound(res, "Ticket not found");
      return;
    }
    const ticket =
      req.user!.role === "REQUESTER"
        ? await prisma.ticket.findFirst({ where: { id, requesterId: req.user!.id } })
        : await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    const rows = await prisma.actionTaken.findMany({
      where: { ticketId: ticket.id },
      include: { performedBy: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      items: rows.map((a) => ({
        id: a.id,
        description: a.description,
        result: a.result,
        performedBy: { id: a.performedBy.id, name: a.performedBy.name },
        followUpRequired: a.followUpRequired,
        followUpNote: a.followUpNote,
        attachmentNotes: a.attachmentNotes,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    });
  } catch {
    internalError(res, "Unable to load actions");
  }
});

ticketsRouter.post("/:id/resolved-indication", ...requesterWrite, async (req, res) => {
  try {
    const ticket = await ownedTicket(req, res);
    if (!ticket) return;
    if (!INDICATABLE_STATUSES.includes(ticket.currentStatus)) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Ticket cannot be marked as resolved in its current status",
          details: [{ field: "status", message: `Allowed only in: ${INDICATABLE_STATUSES.join(", ")}` }],
        },
      });
      return;
    }
    if (ticket.requesterResolved) {
      res.status(200).json({
        requesterResolved: true,
        requesterResolvedAt: ticket.requesterResolvedAt ? ticket.requesterResolvedAt.toISOString() : null,
      });
      return;
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { requesterResolved: true, requesterResolvedAt: now },
      }),
      prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: req.user!.id,
          visibility: "PUBLIC",
          body: "Requester indicated the problem appears resolved.",
        },
      }),
    ]);
    res.status(200).json({ requesterResolved: true, requesterResolvedAt: now.toISOString() });
  } catch {
    internalError(res, "Unable to record resolved indication");
  }
});
