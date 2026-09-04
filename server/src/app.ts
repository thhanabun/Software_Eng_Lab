import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { categoriesRouter } from "./routes/categories";
import { requestersRouter } from "./routes/requesters";
import { relatedSystemsRouter } from "./routes/relatedSystems";
import { ticketsRouter } from "./routes/tickets";
import { ticketAttachmentsRouter } from "./routes/ticketAttachments";
import { attachmentsRouter } from "./routes/attachments";

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/requesters", requestersRouter);
  app.use("/api/related-systems", relatedSystemsRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/tickets/:id/attachments", ticketAttachmentsRouter);
  app.use("/api/attachments", attachmentsRouter);

  return app;
}
