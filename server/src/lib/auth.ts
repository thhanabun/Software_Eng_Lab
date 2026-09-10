import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { SESSION_COOKIE, resolveSession, type SessionUser } from "./session";

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

// Attaches req.user when the session cookie is valid; 401 otherwise.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await resolveSession(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    unauthorized(res);
    return;
  }
  req.user = user;
  next();
}

// requireAuth + role gate. Requesters hitting staff/admin routes get 403 here.
export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = await resolveSession(req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      unauthorized(res);
      return;
    }
    if (!roles.includes(user.role)) {
      forbidden(res);
      return;
    }
    req.user = user;
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
