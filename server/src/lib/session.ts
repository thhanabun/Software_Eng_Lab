import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db";

export const SESSION_COOKIE = "toktickit_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const PENDING_TTL_MS = 30 * 60 * 1000;

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
}

export function safeUser(user: {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
}): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number, pendingChange: boolean): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (pendingChange ? PENDING_TTL_MS : SESSION_TTL_MS));
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export type SessionResolution =
  | { kind: "ok"; user: SessionUser }
  | { kind: "inactive" }
  | { kind: "none" };

async function lookupSession(token: string) {
  return prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
}

export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  const result = await resolveSessionStatus(token);
  return result.kind === "ok" ? result.user : null;
}

// Full resolution: missing/expired -> none; live session of a deactivated
// user -> inactive (session row destroyed so it can never be reused).
export async function resolveSessionStatus(token: string | undefined): Promise<SessionResolution> {
  if (!token) return { kind: "none" };
  const session = await lookupSession(token);
  if (!session) return { kind: "none" };
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return { kind: "none" };
  }
  if (!session.user.active) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return { kind: "inactive" };
  }
  return { kind: "ok", user: safeUser(session.user) };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.delete({ where: { tokenHash: hashToken(token) } }).catch(() => undefined);
}

export async function destroyUserSessions(userId: number): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export function sessionCookieOptions(maxAgeMs: number): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeMs,
  };
}
