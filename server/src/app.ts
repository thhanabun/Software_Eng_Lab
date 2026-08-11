import express from "express";
import cors from "cors";

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({ service: "TokTickIT API" });
  });

  return app;
}
