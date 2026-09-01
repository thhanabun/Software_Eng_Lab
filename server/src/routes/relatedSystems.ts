import { Router } from "express";
import { prisma } from "../db";

export const relatedSystemsRouter: Router = Router();

relatedSystemsRouter.get("/", async (_req, res) => {
  try {
    const systems = await prisma.relatedSystem.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(systems);
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load related systems",
      },
    });
  }
});
