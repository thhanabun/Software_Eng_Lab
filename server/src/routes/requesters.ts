import { Router } from "express";
import { prisma } from "../db";

export const requestersRouter: Router = Router();

requestersRouter.get("/", async (_req, res) => {
  try {
    // Lab 3 compat (Issue #30): serves the Lab 2 selector from User rows.
    // Removed in Issue #31 with the selector itself.
    const requesters = await prisma.user.findMany({
      where: { active: true, role: "REQUESTER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load development requesters",
      },
    });
  }
});
