import { Router } from "express";
import { prisma } from "../db";

export const healthRouter: Router = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", service: "TokTickIT API" });
  } catch {
    res.status(503).json({ status: "error", service: "TokTickIT API" });
  }
});
