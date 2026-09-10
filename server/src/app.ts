import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { categoriesRouter } from "./routes/categories";
import { requestersRouter } from "./routes/requesters";
import { relatedSystemsRouter } from "./routes/relatedSystems";
import { authRouter } from "./routes/auth";
import { ticketsRouter } from "./routes/tickets";
import { ticketAttachmentsRouter } from "./routes/ticketAttachments";
import { attachmentsRouter } from "./routes/attachments";

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/requesters", requestersRouter);
  app.use("/api/related-systems", relatedSystemsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/tickets/:id/attachments", ticketAttachmentsRouter);
  app.use("/api/attachments", attachmentsRouter);

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
