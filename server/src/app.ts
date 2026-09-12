import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { categoriesRouter } from "./routes/categories";
import { relatedSystemsRouter } from "./routes/relatedSystems";
import { authRouter } from "./routes/auth";
import { staffRouter } from "./routes/staff";
import { staffTicketsRouter } from "./routes/staffTickets";
import { ticketsRouter } from "./routes/tickets";
import { ticketAttachmentsRouter } from "./routes/ticketAttachments";
import { attachmentsRouter } from "./routes/attachments";

export function createApp(): express.Express {
  const app = express();

  // Same-origin in dev via the Vite proxy; explicit origin + credentials so
  // direct cross-origin clients (and production) can use cookie auth.
  app.use(cors({ origin: process.env.CLIENT_URL ?? "http://localhost:5173", credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/related-systems", relatedSystemsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/staff/tickets", staffTicketsRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/tickets/:id/attachments", ticketAttachmentsRouter);
  app.use("/api/attachments", attachmentsRouter);

  // BR-29: unmatched routes answer with the safe shape too (no HTML leak).
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  // BR-29: never leak stacks/SQL/paths — malformed JSON and unexpected
  // errors both answer with the safe error shape, never the Express HTML page.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (err as { status?: unknown }).status;
    if (err instanceof SyntaxError && status === 400) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body is not valid JSON",
          details: [{ field: "body", message: "Request body must be valid JSON" }],
        },
      });
      return;
    }
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  });

  return app;
}
