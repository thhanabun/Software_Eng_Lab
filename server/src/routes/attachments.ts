import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import type { Attachment } from "@prisma/client";
import { prisma } from "../db";
import { parsePositiveIntParam, resolveRequesterId, validationError } from "../lib/requesterHeader";
import { UPLOADS_DIR } from "../lib/attachments";
import { attachmentMeta } from "./ticketAttachments";

export const attachmentsRouter: Router = Router();

async function ownedAttachment(req: Request, res: Response): Promise<Attachment | null> {
  const requesterId = await resolveRequesterId(req, res);
  if (requesterId === null) return null;

  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found" } });
    return null;
  }

  const attachment = await prisma.attachment.findUnique({ where: { id }, include: { ticket: true } });
  if (!attachment || attachment.ticket.requesterId !== requesterId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found" } });
    return null;
  }
  return attachment;
}

attachmentsRouter.get("/:id", async (req, res) => {
  const attachment = await ownedAttachment(req, res);
  if (attachment) res.json(attachmentMeta(attachment));
});

attachmentsRouter.get("/:id/download", async (req, res) => {
  const attachment = await ownedAttachment(req, res);
  if (!attachment) return;

  if (attachment.removedAt) {
    res.status(410).json({
      error: { code: "GONE", message: "This attachment has been removed and can no longer be downloaded" },
    });
    return;
  }

  const storedPath = path.join(UPLOADS_DIR, attachment.storedName);
  if (!fs.existsSync(storedPath)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment file is missing on the server" } });
    return;
  }
  res.setHeader("Content-Type", attachment.mimeType);
  res.download(storedPath, attachment.originalName);
});

attachmentsRouter.delete("/:id", async (req, res) => {
  const attachment = await ownedAttachment(req, res);
  if (!attachment) return;

  if (attachment.removedAt) {
    res.status(409).json({
      error: { code: "CONFLICT", message: "Attachment has already been removed" },
    });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length === 0) {
    validationError(res, "Removal reason is required", "reason", "A removal reason is required");
    return;
  }
  if (reason.length > 200) {
    validationError(
      res,
      "Removal reason is invalid",
      "reason",
      "Removal reason must be 200 characters or fewer",
    );
    return;
  }

  try {
    const updated = await prisma.attachment.update({
      where: { id: attachment.id },
      data: { removedAt: new Date(), removalReason: reason },
    });
    res.json(attachmentMeta(updated));
  } catch {
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unable to remove attachment" },
    });
  }
});
