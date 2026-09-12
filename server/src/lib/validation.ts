import type { Response } from "express";

export function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function parsePositiveIntParam(value: unknown): number | null {
  return toPositiveInt(value);
}

export function notFound(res: Response, message: string): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message } });
}

export function validationError(res: Response, message: string, field: string, detail: string): void {
  res.status(400).json({
    error: { code: "VALIDATION_ERROR", message, details: [{ field, message: detail }] },
  });
}

export function internalError(res: Response, message: string): void {
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message },
  });
}
