import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { SESSION_COOKIE, resolveSessionStatus, type SessionUser } from "./session";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

function unauthorized(res: Response): void {
  res.status(401).json({
    error: { code: "UNAUTHENTICATED", message: "Sign in required" },
  });
}

export function deactivated(res: Response): void {
  res.status(403).json({
    error: { code: "FORBIDDEN", message: "This account has been deactivated. Contact your administrator." },
  });
}

export function forbidden(res: Response, message = "Access denied"): void {
  res.status(403).json({
    error: { code: "FORBIDDEN", message },
  });
}

export function passwordChangeRequired(res: Response): void {
  res.status(403).json({
    error: {
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Choose a new password before continuing",
    },
  });
}

async function attachUser(req: Request): Promise<SessionUser | "inactive" | "none"> {
  // Reuse the user attached by an earlier middleware in the chain.
  if (req.user) return req.user;
  const result = await resolveSessionStatus(req.cookies?.[SESSION_COOKIE]);
  if (result.kind === "ok") {
    req.user = result.user;
    return result.user;
  }
  return result.kind;
}

// Attaches req.user when the session cookie is valid; 401 for missing/expired
// sessions, 403 (and session destroyed) when the user was deactivated.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await attachUser(req);
  if (user === "none") {
    unauthorized(res);
    return;
  }
  if (user === "inactive") {
    deactivated(res);
    return;
  }
  next();
}

// Role gate for chains: requireAuth must run first (reads req.user, resolves
// standalone when it has to). Wrong role -> 403.
export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = await attachUser(req);
    if (user === "none") {
      unauthorized(res);
      return;
    }
    if (user === "inactive") {
      deactivated(res);
      return;
    }
    if (!roles.includes(user.role)) {
      forbidden(res);
      return;
    }
    next();
  };
}

// Blocks must-change sessions from normal APIs (BR-02). Auth routes stay open.
export function requireFreshPassword(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.mustChangePassword) {
    passwordChangeRequired(res);
    return;
  }
  next();
}
