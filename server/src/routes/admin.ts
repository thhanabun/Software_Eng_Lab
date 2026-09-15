import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireFreshPassword, requireRole } from "../lib/auth";
import { hashPassword, normalizeEmail, validateNewPassword } from "../lib/password";
import { destroyUserSessions, safeUser } from "../lib/session";
import { internalError, notFound, parsePositiveIntParam, validationError } from "../lib/validation";

export const adminRouter: Router = Router();

const ROLES = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;

const adminOnly = [requireAuth, requireRole("ADMINISTRATOR"), requireFreshPassword];

function safeListUser(user: {
  id: number;
  name: string;
  email: string;
  role: (typeof ROLES)[number];
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}) {
  return { ...safeUser(user), createdAt: user.createdAt.toISOString() };
}

async function activeAdminCount(excludeId?: number): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMINISTRATOR", active: true, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
  });
}

// GET /api/admin/users — list with name/email search + single role filter.
adminRouter.get("/users", ...adminOnly, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const role = typeof req.query.role === "string" ? req.query.role.trim() : "";
  if (role && !(ROLES as readonly string[]).includes(role)) {
    validationError(res, "Role filter is invalid", "role", "role must be REQUESTER, IT_STAFF, or ADMINISTRATOR");
    return;
  }
  try {
    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as (typeof ROLES)[number] } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    res.json({ items: users.map(safeListUser) });
  } catch {
    internalError(res, "Unable to load users");
  }
});

// POST /api/admin/users — create with one role + initial password (BR-23).
adminRouter.post("/users", ...adminOnly, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const role = body.role as unknown;
  const active = body.active === undefined ? true : body.active === true;
  const initialPassword = body.initialPassword as unknown;

  if (name.length === 0 || name.length > 100) {
    validationError(res, "Name is invalid", "name", "Name is required (1-100 characters)");
    return;
  }
  if (!email) {
    validationError(res, "Email is invalid", "email", "A valid unique email is required");
    return;
  }
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) {
    validationError(res, "Role is invalid", "role", "role must be REQUESTER, IT_STAFF, or ADMINISTRATOR");
    return;
  }
  const pwIssues = validateNewPassword(initialPassword);
  if (pwIssues.length > 0) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Initial password is invalid", details: pwIssues } });
    return;
  }

  try {
    const duplicate = await prisma.user.findUnique({ where: { email } });
    if (duplicate) {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "Email is already in use",
          details: [{ field: "email", message: "Email is already in use" }],
        },
      });
      return;
    }
    const created = await prisma.user.create({
      data: {
        name,
        email,
        role: role as (typeof ROLES)[number],
        active,
        passwordHash: await hashPassword(initialPassword as string),
        mustChangePassword: true,
      },
    });
    res.status(201).json(safeListUser(created));
  } catch {
    internalError(res, "Unable to create user");
  }
});

// PATCH /api/admin/users/:id — edit name/email/role/active (BR-24..26).
adminRouter.patch("/users/:id", ...adminOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "User not found");
    return;
  }
  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      notFound(res, "User not found");
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: { name?: string; email?: string; role?: (typeof ROLES)[number]; active?: boolean } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length === 0 || name.length > 100) {
        validationError(res, "Name is invalid", "name", "Name is required (1-100 characters)");
        return;
      }
      data.name = name;
    }
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!email) {
        validationError(res, "Email is invalid", "email", "A valid unique email is required");
        return;
      }
      const duplicate = await prisma.user.findFirst({ where: { email, id: { not: id } } });
      if (duplicate) {
        res.status(409).json({
          error: {
            code: "CONFLICT",
            message: "Email is already in use",
            details: [{ field: "email", message: "Email is already in use" }],
          },
        });
        return;
      }
      data.email = email;
    }
    if (body.role !== undefined) {
      if (typeof body.role !== "string" || !(ROLES as readonly string[]).includes(body.role)) {
        validationError(res, "Role is invalid", "role", "role must be REQUESTER, IT_STAFF, or ADMINISTRATOR");
        return;
      }
      data.role = body.role as (typeof ROLES)[number];
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        validationError(res, "Activation is invalid", "active", "active must be true or false");
        return;
      }
      data.active = body.active;
    }

    const nextActive = data.active ?? target.active;
    const nextRole = data.role ?? target.role;
    const wasSoleAdmin = target.role === "ADMINISTRATOR" && target.active;

    // No self-deactivation (BR-25).
    if (id === req.user!.id && nextActive === false) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "You cannot deactivate your own account", details: [{ field: "active", message: "You cannot deactivate your own account" }] },
      });
      return;
    }
    // Never remove the last active Administrator (BR-26).
    if (wasSoleAdmin && (nextActive === false || nextRole !== "ADMINISTRATOR")) {
      if ((await activeAdminCount(id)) === 0) {
        res.status(409).json({
          error: { code: "CONFLICT", message: "The system must keep at least one active Administrator" },
        });
        return;
      }
    }

    const updated = await prisma.user.update({ where: { id }, data });
    // Deactivation kills sessions so access stops immediately.
    if (nextActive === false) await destroyUserSessions(id);
    res.status(200).json(safeListUser(updated));
  } catch {
    internalError(res, "Unable to update user");
  }
});

// POST /api/admin/users/:id/reset-password — new initial password (BR-27).
adminRouter.post("/users/:id/reset-password", ...adminOnly, async (req, res) => {
  const id = parsePositiveIntParam(req.params.id);
  if (id === null) {
    notFound(res, "User not found");
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { newPassword, confirmPassword } = body as { newPassword?: unknown; confirmPassword?: unknown };
  const issues = validateNewPassword(newPassword);
  if (typeof confirmPassword !== "string" || confirmPassword !== newPassword) {
    issues.push({ field: "confirmPassword", message: "Passwords do not match" });
  }
  if (issues.length > 0) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "New password is invalid", details: issues } });
    return;
  }
  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      notFound(res, "User not found");
      return;
    }
    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword as string), mustChangePassword: true },
    });
    await destroyUserSessions(id);
    res.status(200).json({ ok: true });
  } catch {
    internalError(res, "Unable to reset password");
  }
});
