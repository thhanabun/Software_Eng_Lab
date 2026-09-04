import { Router } from "express";
import { prisma } from "../db";

export const requestersRouter: Router = Router();

requestersRouter.get("/", async (_req, res) => {
  try {
    const requesters = await prisma.requesterUser.findMany({
      where: { active: true },
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
