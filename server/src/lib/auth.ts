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

// Resolves the session and attaches req.user (active or not). Returns false
// when there is no usable session at all.
async function attachUser(req: Request): Promise<boolean> {
  // Reuse the user attached by an earlier middleware in the chain.
  if (req.user) return true;
  const result = await resolveSessionStatus(req.cookies?.[SESSION_COOKIE]);
  if (result.kind === "none") return false;
  req.user = result.user;
  return true;
}

// Identity gate for reads: 401 only when there is no session. Inactive users
// keep read-only access to their own history (api-spec S2 carryover).
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await attachUser(req))) {
    unauthorized(res);
    return;
  }
  next();
}

// Write gate: 401 without session, 403 for deactivated accounts.
export async function requireActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await attachUser(req))) {
    unauthorized(res);
    return;
  }
  if (!req.user!.active) {
    deactivated(res);
    return;
  }
  next();
}

// Role gate for chains: requireAuth must run first (reads req.user, resolves
// standalone when it has to). Inactive role-holders are rejected: role routes
// are never read-only. Wrong role -> 403.
export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!(await attachUser(req))) {
      unauthorized(res);
      return;
    }
    if (!req.user!.active) {
      deactivated(res);
      return;
    }
    if (!roles.includes(req.user!.role)) {
      forbidden(res);
      return;
    }
    next();
  };
}

// Requester-only gate for requester routes: staff/admin must use their own
// APIs (matrix). Chains after requireAuth.
export function requireRequesterRole(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "REQUESTER") {
    forbidden(res);
    return;
  }
  next();
}

// Blocks must-change sessions from normal APIs (BR-02). Auth routes stay open.
export function requireFreshPassword(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.mustChangePassword) {
    passwordChangeRequired(res);
    return;
  }
  next();
}
