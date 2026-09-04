import { randomUUID } from "node:crypto";
import path from "node:path";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;
export const UPLOADS_DIR = path.resolve("uploads");

export const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function newStoredName(originalName: string): string {
  const ext = extensionOf(originalName);
  return ext ? `${randomUUID()}.${ext}` : randomUUID();
}

export function isAllowedType(originalName: string, mimeType: string): boolean {
  const ext = extensionOf(originalName);
  return MIME_BY_EXTENSION[ext] === mimeType;
}
