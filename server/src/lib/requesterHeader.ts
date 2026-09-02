import type { Request, Response } from "express";
import { prisma } from "../db";

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function parsePositiveIntParam(value: unknown): number | null {
  return toPositiveInt(value);
}

export async function resolveRequesterId(req: Request, res: Response): Promise<number | null> {
  const requesterId = toPositiveInt(req.headers["x-requester-id"]);
  if (requesterId === null) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Valid X-Requester-Id header is required",
        details: [{ field: "requesterId", message: "X-Requester-Id must be a positive integer" }],
      },
    });
    return null;
  }

  const requester = await prisma.requesterUser.findUnique({ where: { id: requesterId } });
  if (!requester) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Requester not found" },
    });
    return null;
  }

  return requesterId;
}

export function validationError(res: Response, message: string, field: string, detail: string): void {
  res.status(400).json({
    error: { code: "VALIDATION_ERROR", message, details: [{ field, message: detail }] },
  });
}
