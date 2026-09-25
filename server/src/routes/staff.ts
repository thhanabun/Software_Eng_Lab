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

const ACTION_DESC_MAX = 2000;
const ACTION_RESULT_MAX = 2000;
const FOLLOWUP_NOTE_MAX = 1000;
const ATTACH_NOTES_MAX = 500;

interface ActionRow {
  id: number;
  description: string;
  result: string;
  performedByName: string;
  performedByRole: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeActions(rows: ActionRow[]) {
  return rows.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));
}

async function actionRows(ticketId: number): Promise<ActionRow[]> {
  const rows = await prisma.actionTaken.findMany({
    where: { ticketId },
    include: { performedBy: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    description: a.description,
    result: a.result,
    performedByName: a.performedBy.name,
    performedByRole: a.performedBy.role,
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}

interface ParsedAction {
  description: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
}

function strField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length === 0 ? null : text;
}

// Validates create-shape fields. For PATCH, pass current values for fields the
// caller omits; flip semantics: true->false clears the note, false->true
// requires a note in the same call.
function parseActionFields(
  body: Record<string, unknown>,
  res: Parameters<typeof validationError>[0],
  current?: { description: string; result: string; followUpRequired: boolean; followUpNote: string | null; attachmentNotes: string | null },
): ParsedAction | null {
  const isPatch = current !== undefined;

  const rawDesc = body.description;
  const description = rawDesc === undefined && isPatch ? current.description : strField(rawDesc);
  if (description === null || description.length > ACTION_DESC_MAX) {
    if (description !== null) {
      validationError(res, "Description is too long", "description", `Description must be ${ACTION_DESC_MAX} characters or fewer`);
    } else {
      validationError(res, "Description is required", "description", "Description must not be empty");
    }
    return null;
  }

  const rawResult = body.result;
  const result = rawResult === undefined && isPatch ? current.result : strField(rawResult);
  if (result === null || result.length > ACTION_RESULT_MAX) {
    if (result !== null) {
      validationError(res, "Result is too long", "result", `Result must be ${ACTION_RESULT_MAX} characters or fewer`);
    } else {
      validationError(res, "Result is required", "result", "Result must not be empty");
    }
    return null;
  }

  const rawFollow = body.followUpRequired;
  let followUpRequired: boolean;
  if (rawFollow === undefined && isPatch) {
    followUpRequired = current.followUpRequired;
  } else if (typeof rawFollow === "boolean") {
    followUpRequired = rawFollow;
  } else {
    validationError(res, "Follow-up flag is required", "followUpRequired", "followUpRequired must be a boolean");
    return null;
  }

  const rawNote = body.followUpNote;
  const flippedOff = isPatch && current.followUpRequired && !followUpRequired;
  let followUpNote: string | null;
  if (flippedOff) {
    followUpNote = null; // flip true->false clears the stored note
  } else if (rawNote !== undefined && rawNote !== null && typeof rawNote !== "string") {
    validationError(res, "Follow-up note is invalid", "followUpNote", "Follow-up note must be a string");
    return null;
  } else {
    const note = typeof rawNote === "string" ? rawNote.trim() : "";
    if (followUpRequired) {
      if (note.length > FOLLOWUP_NOTE_MAX) {
        validationError(res, "Follow-up note is too long", "followUpNote", `Follow-up note must be ${FOLLOWUP_NOTE_MAX} characters or fewer`);
        return null;
      }
      if (note.length > 0) {
        followUpNote = note;
      } else if (isPatch && current.followUpNote) {
        followUpNote = current.followUpNote; // keep existing note
      } else {
        validationError(res, "Follow-up note is required", "followUpNote", "Follow-up note is required when follow-up is needed");
        return null;
      }
    } else {
      if (note.length > 0) {
        validationError(res, "Follow-up note must be blank", "followUpNote", "Follow-up note must be blank when follow-up is not needed");
        return null;
      }
      followUpNote = null;
    }
  }

  const rawAttach = body.attachmentNotes;
  let attachmentNotes: string | null;
  if (rawAttach === undefined || rawAttach === null) {
    attachmentNotes = isPatch ? current.attachmentNotes : null;
  } else if (typeof rawAttach !== "string") {
    validationError(res, "Attachment notes are invalid", "attachmentNotes", "Attachment notes must be a string");
    return null;
  } else {
    const attach = rawAttach.trim();
    if (attach.length > ATTACH_NOTES_MAX) {
      validationError(res, "Attachment notes are too long", "attachmentNotes", `Attachment notes must be ${ATTACH_NOTES_MAX} characters or fewer`);
      return null;
    }
    attachmentNotes = attach.length === 0 ? null : attach;
  }

  return { description, result, followUpRequired, followUpNote, attachmentNotes };
}

// Optimistic concurrency: compares the client-seen ticket stamp. Sends 409 on
// mismatch, 400 on unparseable stamp. Missing stamp = no check (create only).
function checkFreshTicket(
  ticketUpdatedAt: Date,
  expected: unknown,
  res: Parameters<typeof validationError>[0],
  opts: { required: boolean },
): boolean {
  if (expected === undefined || expected === null) {
    if (opts.required) {
      validationError(res, "Freshness stamp is required", "expectedUpdatedAt", "expectedUpdatedAt must be the ticket updatedAt you saw");
      return false;
    }
    return true;
  }
  const seen = typeof expected === "string" ? new Date(expected).getTime() : NaN;
  if (Number.isNaN(seen)) {
    validationError(res, "Freshness stamp is invalid", "expectedUpdatedAt", "expectedUpdatedAt must be an ISO date-time");
    return false;
  }
  if (seen !== ticketUpdatedAt.getTime()) {
    res.status(409).json({
      error: { code: "CONFLICT", message: "Ticket was updated by another user; reload and retry" },
    });
    return false;
  }
  return true;
}

function actionConflict(res: Parameters<typeof validationError>[0], message: string, field: string, detail: string) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message, details: [{ field, message: detail }] } });
}

// GET /api/staff/tickets/:id/actions — staff list (any ticket).
staffRouter.get("/tickets/:id/actions", ...staffOnly, async (req, res) => {
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
    res.json(serializeActions(await actionRows(id)));
  } catch {
    internalError(res, "Unable to load actions");
  }
});

// POST /api/staff/tickets/:id/actions — create (performer + time from server).
staffRouter.post("/tickets/:id/actions", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "Ticket not found");
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input = parseActionFields(body, res);
  if (!input) return;
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    if (ticket.currentStatus === "CANCELLED") {
      actionConflict(res, "Ticket is cancelled", "ticket", "Actions cannot be added to a cancelled ticket");
      return;
    }
    if (!checkFreshTicket(ticket.updatedAt, body.expectedUpdatedAt, res, { required: false })) return;
    // Concurrent creates both win in creation order; updatedAt advances to latest.
    const [created] = await prisma.$transaction([
      prisma.actionTaken.create({
        data: {
          ticketId: id,
          performedById: req.user!.id,
          description: input.description,
          result: input.result,
          followUpRequired: input.followUpRequired,
          followUpNote: input.followUpNote,
          attachmentNotes: input.attachmentNotes,
        },
        include: { performedBy: true },
      }),
      prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    res.status(201).json({
      id: created.id,
      description: created.description,
      result: created.result,
      performedByName: created.performedBy.name,
      performedByRole: created.performedBy.role,
      followUpRequired: created.followUpRequired,
      followUpNote: created.followUpNote,
      attachmentNotes: created.attachmentNotes,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  } catch {
    internalError(res, "Unable to create action");
  }
});

// PATCH /api/staff/tickets/:id/actions/:actionId — edit (stamp required).
staffRouter.patch("/tickets/:id/actions/:actionId", ...staffOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  const actionId = parsePositiveIntParam(req.params.actionId);
  if (id === null || actionId === null) {
    notFound(res, "Action not found");
    return;
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      notFound(res, "Ticket not found");
      return;
    }
    const existing = await prisma.actionTaken.findFirst({ where: { id: actionId, ticketId: id } });
    if (!existing) {
      notFound(res, "Action not found");
      return;
    }
    if (ticket.currentStatus === "CANCELLED") {
      actionConflict(res, "Ticket is cancelled", "ticket", "Actions cannot be edited on a cancelled ticket");
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!checkFreshTicket(ticket.updatedAt, body.expectedUpdatedAt, res, { required: true })) return;
    const input = parseActionFields(body, res, {
      description: existing.description,
      result: existing.result,
      followUpRequired: existing.followUpRequired,
      followUpNote: existing.followUpNote,
      attachmentNotes: existing.attachmentNotes,
    });
    if (!input) return;
    const [updated] = await prisma.$transaction([
      prisma.actionTaken.update({
        where: { id: actionId },
        data: {
          description: input.description,
          result: input.result,
          followUpRequired: input.followUpRequired,
          followUpNote: input.followUpNote,
          attachmentNotes: input.attachmentNotes,
        },
        include: { performedBy: true },
      }),
      prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    res.json({
      id: updated.id,
      description: updated.description,
      result: updated.result,
      performedByName: updated.performedBy.name,
      performedByRole: updated.performedBy.role,
      followUpRequired: updated.followUpRequired,
      followUpNote: updated.followUpNote,
      attachmentNotes: updated.attachmentNotes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch {
    internalError(res, "Unable to update action");
  }
});

// DELETE on action paths — forbidden, single locked behavior (BR-07).
staffRouter.delete("/tickets/:id/actions/:actionId", ...staffOnly, (_req, res) => {
  res.setHeader("Allow", "GET, POST, PATCH");
  res.status(405).json({ error: { code: "FORBIDDEN", message: "Actions cannot be deleted" } });
});

staffRouter.delete("/tickets/:id/actions", ...staffOnly, (_req, res) => {
  res.setHeader("Allow", "GET, POST, PATCH");
  res.status(405).json({ error: { code: "FORBIDDEN", message: "Actions cannot be deleted" } });
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
