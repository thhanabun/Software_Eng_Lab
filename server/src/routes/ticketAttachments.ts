import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { prisma } from "../db";
import { parsePositiveIntParam, resolveRequesterId, validationError } from "../lib/requesterHeader";
import {
  MAX_ACTIVE_ATTACHMENTS,
  MAX_FILE_BYTES,
  UPLOADS_DIR,
  isAllowedType,
  newStoredName,
} from "../lib/attachments";
import type { Attachment } from "@prisma/client";

export const ticketAttachmentsRouter: Router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => cb(null, newStoredName(file.originalname)),
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

export function attachmentMeta(attachment: Attachment) {
  return {
    id: attachment.id,
    ticketId: attachment.ticketId,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedAt: attachment.uploadedAt.toISOString(),
    removedAt: attachment.removedAt ? attachment.removedAt.toISOString() : null,
    removalReason: attachment.removalReason,
  };
}

export function sortAttachments(attachments: Attachment[]): Attachment[] {
  const byNewest = (a: Attachment, b: Attachment) => b.uploadedAt.getTime() - a.uploadedAt.getTime();
  return [
    ...attachments.filter((a) => !a.removedAt).sort(byNewest),
    ...attachments.filter((a) => a.removedAt).sort(byNewest),
  ];
}

async function ownedTicketId(req: Request, res: Response): Promise<number | null> {
  const requesterId = await resolveRequesterId(req, res);
  if (requesterId === null) return null;

  const ticketId = parsePositiveIntParam(req.params.id);
  if (ticketId === null) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found" } });
    return null;
  }

  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
  if (!ticket) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found" } });
    return null;
  }
  return ticketId;
}

function uploadSingle(req: Request, res: Response, next: () => void): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: { code: "PAYLOAD_TOO_LARGE", message: "File exceeds the 5 MB limit" },
        });
        return;
      }
      validationError(res, "Invalid file upload", "file", "Upload could not be processed");
      return;
    }
    next();
  });
}

ticketAttachmentsRouter.post(
  "/",
  async (req, res, next) => {
    const ticketId = await ownedTicketId(req, res);
    if (ticketId === null) return;

    const activeCount = await prisma.attachment.count({ where: { ticketId, removedAt: null } });
    if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: `A ticket can have at most ${MAX_ACTIVE_ATTACHMENTS} active attachments`,
        },
      });
      return;
    }
    next();
  },
  uploadSingle,
  async (req, res) => {
    const file = req.file;
    if (!file) {
      validationError(res, "Invalid file upload", "file", "Attach a file under the field name 'file'");
      return;
    }

    const storedPath = path.join(UPLOADS_DIR, file.filename);
    const reject = (status: number, code: string, message: string) => {
      fs.promises.rm(storedPath, { force: true }).catch(() => undefined);
      res.status(status).json({ error: { code, message } });
    };

    if (!isAllowedType(file.originalname, file.mimetype)) {
      reject(415, "UNSUPPORTED_MEDIA", "Only JPG, JPEG, PNG, WEBP or PDF files are allowed");
      return;
    }

    try {
      const ticketId = Number(req.params.id);
      const attachment = await prisma.attachment.create({
        data: {
          ticketId,
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
      res.status(201).json(attachmentMeta(attachment));
    } catch {
      fs.promises.rm(storedPath, { force: true }).catch(() => undefined);
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Unable to store attachment" },
      });
    }
  },
);

ticketAttachmentsRouter.get("/", async (req, res) => {
  const ticketId = await ownedTicketId(req, res);
  if (ticketId === null) return;

  try {
    const attachments = await prisma.attachment.findMany({ where: { ticketId } });
    res.json(sortAttachments(attachments).map(attachmentMeta));
  } catch {
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unable to load attachments" },
    });
  }
});
