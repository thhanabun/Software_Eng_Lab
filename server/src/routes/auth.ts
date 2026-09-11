import { Router } from "express";
import { prisma } from "../db";
import { deactivated, requireAuth } from "../lib/auth";
import { hashPassword, normalizeEmail, validateNewPassword, verifyLoginPassword, verifyPassword } from "../lib/password";
import {
  SESSION_COOKIE,
  PENDING_TTL_MS,
  SESSION_TTL_MS,
  createSession,
  destroySession,
  destroyUserSessions,
  safeUser,
  sessionCookieOptions,
} from "../lib/session";

export const authRouter: Router = Router();

function maxAgeFor(pending: boolean): number {
  return pending ? PENDING_TTL_MS : SESSION_TTL_MS;
}

// POST /api/auth/login — email + password -> session cookie + safe user.
authRouter.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Email and password are required",
        details: [
          ...(email ? [] : [{ field: "email", message: "Valid email is required" }]),
          ...(password ? [] : [{ field: "password", message: "Password is required" }]),
        ],
      },
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Identical generic 401 for unknown email and wrong password (BR-06):
  // the dummy-hash compare keeps both paths equally expensive.
  if (!user || !(await verifyLoginPassword(password, user.passwordHash))) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Invalid email or password" },
    });
    return;
  }
  if (!user.active) {
    deactivated(res);
    return;
  }

  const pending = user.mustChangePassword;
  const { token } = await createSession(user.id, pending);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(maxAgeFor(pending)));
  res.status(200).json({ user: safeUser(user) });
});

// POST /api/auth/logout — idempotent session invalidation.
authRouter.post("/logout", async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ ok: true });
});

// GET /api/auth/me — current safe identity (reachable during pending-change).
authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

// POST /api/auth/change-password — initial (no current needed) or voluntary change.
authRouter.post("/change-password", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.active) {
    deactivated(res);
    return;
  }

  const { currentPassword, newPassword, confirmPassword } = req.body ?? {};

  // The current (or initial) password is always required and verified, so the
  // BR-09 differ-check applies uniformly to both flows.
  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Current password is required",
        details: [{ field: "currentPassword", message: "Current password is required" }],
      },
    });
    return;
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Current password is incorrect" },
    });
    return;
  }

  const issues = validateNewPassword(newPassword, currentPassword);
  if (typeof confirmPassword !== "string" || confirmPassword !== newPassword) {
    issues.push({ field: "confirmPassword", message: "Passwords do not match" });
  }
  if (issues.length > 0) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "New password is invalid", details: issues },
    });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  // Password change kills sibling sessions (AD-14); caller keeps this one.
  await destroyUserSessions(user.id);
  const { token } = await createSession(user.id, false);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(SESSION_TTL_MS));
  res.status(200).json({ user: safeUser(updated) });
});
