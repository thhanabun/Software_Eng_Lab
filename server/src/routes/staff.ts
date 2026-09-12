import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { RequestedPriority } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, requireFreshPassword, requireRole } from "../lib/auth";
import { ACTIVE_WORK_STATUSES, canTransition, isValidStatus } from "../lib/transitions";
import { internalError, notFound, parsePositiveIntParam, validationError } from "../lib/validation";
import { UPLOADS_DIR } from "../lib/attachments";
import { attachmentMeta, sortAttachments } from "./ticketAttachments";

export const staffRouter: Router = Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const COMMENT_MAX = 2000;

const staffOnly = [requireAuth, requireRole("IT_STAFF", "ADMINISTRATOR"), requireFreshPassword];

interface EntryRow {
  id: number;
  body: string;
  authorName: string;
  authorRole: string;
  createdAt: Date;
}

function serializeEntries(rows: EntryRow[]) {
  return rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }));
}

async function findTicket(id: number) {
  return prisma.ticket.findUnique({
    where: { id },
    include: { category: true, relatedSystem: true, requester: true, owner: true, attachments: true },
  });
}

type FullTicket = NonNullable<Awaited<ReturnType<typeof findTicket>>>;

function ticketResponse(ticket: FullTicket, comments: EntryRow[], notes: EntryRow[]) {
  const { category, relatedSystem, requester, owner, attachments, ...fields } = ticket;
  return {
    ...fields,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    requesterResolvedAt: ticket.requesterResolvedAt ? ticket.requesterResolvedAt.toISOString() : null,
    categoryName: category.name,
    relatedSystemName: relatedSystem.name,
    requester: { id: requester.id, name: requester.name, email: requester.email },
    owner: owner ? { id: owner.id, name: owner.name } : null,
    comments: serializeEntries(comments),
    notes: serializeEntries(notes),
    attachments: sortAttachments(attachments).map(attachmentMeta),
  };
}

async function channelEntries(ticketId: number, visibility: "PUBLIC" | "INTERNAL"): Promise<EntryRow[]> {
  const rows = await prisma.ticketComment.findMany({
    where: { ticketId, visibility },
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

// GET /api/staff/tickets/:id — full staff detail (both channels + evidence).
staffRouter.get("/tickets/:id", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  try {
    const ticket = await findTicket(id);
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    const [comments, notes] = await Promise.all([
      channelEntries(ticket.id, "PUBLIC"),
      channelEntries(ticket.id, "INTERNAL"),
    ]);
    res.json(ticketResponse(ticket, comments, notes));
  } catch {
    internalError(res, "Unable to load ticket");
  }
});

// POST /api/staff/tickets/:id/claim — take ownership (NEW becomes OPEN).
staffRouter.post("/tickets/:id/claim", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  try {
    const ticket = await findTicket(id);
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    if (ticket.ownerId === req.user!.id) {
      res.status(200).json({ owner: { id: ticket.owner!.id, name: ticket.owner!.name }, currentStatus: ticket.currentStatus });
      return;
    }
    if (ticket.ownerId !== null) {
      res.status(409).json({
        error: { code: "CONFLICT", message: `Ticket is owned by ${ticket.owner!.name}; use assign to hand over.` },
      });
      return;
    }
    const updated = await prisma.ticket.update({
      where: { id },
      data: { ownerId: req.user!.id, currentStatus: ticket.currentStatus === "NEW" ? "OPEN" : ticket.currentStatus },
      include: { owner: true },
    });
    res.status(200).json({ owner: { id: updated.owner!.id, name: updated.owner!.name }, currentStatus: updated.currentStatus });
  } catch {
    internalError(res, "Unable to claim ticket");
  }
});

// POST /api/staff/tickets/:id/assign — assign / reassign / unassign (null).
staffRouter.post("/tickets/:id/assign", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  const raw = (req.body ?? {}).ownerId as unknown;
  if (raw !== null && (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0)) {
    validationError(res, "Owner is invalid", "ownerId", "ownerId must be a user id or null");
    return;
  }
  try {
    const ticket = await findTicket(id);
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    if (raw === ticket.ownerId) {
      res.status(200).json({
        owner: ticket.owner ? { id: ticket.owner.id, name: ticket.owner.name } : null,
        currentStatus: ticket.currentStatus,
      });
      return;
    }
    if (raw !== null) {
      const target = await prisma.user.findUnique({ where: { id: raw } });
      if (!target) {
        notFound(res, "User not found");
        return;
      }
      if (!target.active || (target.role !== "IT_STAFF" && target.role !== "ADMINISTRATOR")) {
        validationError(res, "Owner is invalid", "ownerId", "Owner must be an active IT Staff or Administrator user");
        return;
      }
    }
    // Ownership/status coupling (AD-13): genuine handover from NEW acknowledges
    // to OPEN; unassigning active work returns it to the NEW triage pool.
    let status = ticket.currentStatus;
    if (raw !== null && status === "NEW") status = "OPEN";
    if (raw === null && (ACTIVE_WORK_STATUSES as string[]).includes(status)) status = "NEW";
    const updated = await prisma.ticket.update({
      where: { id },
      data: { ownerId: raw, currentStatus: status },
      include: { owner: true },
    });
    res.status(200).json({
      owner: updated.owner ? { id: updated.owner.id, name: updated.owner.name } : null,
      currentStatus: updated.currentStatus,
    });
  } catch {
    internalError(res, "Unable to assign ticket");
  }
});

// PATCH /api/staff/tickets/:id/priority — set IT Priority.
staffRouter.patch("/tickets/:id/priority", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  const itPriority = (req.body ?? {}).itPriority as unknown;
  if (typeof itPriority !== "string" || !PRIORITIES.includes(itPriority)) {
    validationError(res, "IT Priority is invalid", "itPriority", "itPriority must be LOW, MEDIUM, HIGH, or URGENT");
    return;
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    const updated = await prisma.ticket.update({
      where: { id },
      data: { itPriority: itPriority as RequestedPriority },
    });
    res.status(200).json({ id: updated.id, itPriority: updated.itPriority });
  } catch {
    internalError(res, "Unable to update priority");
  }
});

// PATCH /api/staff/tickets/:id/status — controlled transition (BR-17).
staffRouter.patch("/tickets/:id/status", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  const status = (req.body ?? {}).status as unknown;
  if (!isValidStatus(status)) {
    validationError(res, "Status is invalid", "status", "status must be a valid ticket status");
    return;
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    if (!canTransition(ticket.currentStatus, status)) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Status transition is invalid",
          details: [{ field: "status", message: `Transition from ${ticket.currentStatus} to ${status} is not permitted` }],
        },
      });
      return;
    }
    const updated = await prisma.ticket.update({ where: { id }, data: { currentStatus: status } });
    res.status(200).json({ id: updated.id, currentStatus: updated.currentStatus });
  } catch {
    internalError(res, "Unable to update status");
  }
});

// POST /api/staff/tickets/:id/comments — public comments (staff path).
// Requesters use /api/tickets/:id/comments; both write the PUBLIC channel.
staffRouter.post("/tickets/:id/comments", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  const body = (req.body ?? {}).body as unknown;
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length === 0) {
    validationError(res, "Comment body is required", "body", "Comment must not be empty");
    return;
  }
  if (text.length > COMMENT_MAX) {
    validationError(res, "Comment is too long", "body", `Comment must be ${COMMENT_MAX} characters or fewer`);
    return;
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    if (ticket.currentStatus === "CANCELLED") {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Ticket is cancelled", details: [{ field: "ticket", message: "Comments cannot be added to a cancelled ticket" }] },
      });
      return;
    }
    const created = await prisma.ticketComment.create({
      data: { ticketId: id, authorId: req.user!.id, visibility: "PUBLIC", body: text },
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

// GET+POST /api/staff/tickets/:id/notes — internal notes (primary path).
staffRouter.get("/tickets/:id/notes", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    res.json(serializeEntries(await channelEntries(id, "INTERNAL")));
  } catch {
    internalError(res, "Unable to load notes");
  }
});

staffRouter.post("/tickets/:id/notes", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  const body = (req.body ?? {}).body as unknown;
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length === 0) {
    validationError(res, "Note body is required", "body", "Note must not be empty");
    return;
  }
  if (text.length > COMMENT_MAX) {
    validationError(res, "Note is too long", "body", `Note must be ${COMMENT_MAX} characters or fewer`);
    return;
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    if (ticket.currentStatus === "CANCELLED") {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Ticket is cancelled", details: [{ field: "ticket", message: "Notes cannot be added to a cancelled ticket" }] },
      });
      return;
    }
    const created = await prisma.ticketComment.create({
      data: { ticketId: id, authorId: req.user!.id, visibility: "INTERNAL", body: text },
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
    internalError(res, "Unable to post note");
  }
});

// GET /api/staff/attachments/:id/download — read-only evidence access (AC-31).
staffRouter.get("/attachments/:id/download", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Attachment not found");
    return;
  }
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      notFound(res, "Attachment not found");
      return;
    }
    if (attachment.removedAt) {
      res.status(410).json({
        error: { code: "GONE", message: "This attachment has been removed and can no longer be downloaded" },
      });
      return;
    }
    const storedPath = path.join(UPLOADS_DIR, attachment.storedName);
    if (!fs.existsSync(storedPath)) {
      notFound(res, "Attachment file is missing on the server");
      return;
    }
    res.setHeader("Content-Type", attachment.mimeType);
    res.download(storedPath, attachment.originalName);
  } catch {
    internalError(res, "Unable to download attachment");
  }
});

// GET /api/staff/users — assignable directory: active IT Staff + Administrators.
// Contract delta (Issue #33): the approved contract assumed owner selection
// without a directory endpoint; this minimal read-only list fills the gap
// without the full admin user management of Issue #34.
staffRouter.get("/users", ...staffOnly, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { active: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    res.json(users);
  } catch {
    internalError(res, "Unable to load users");
  }
});
