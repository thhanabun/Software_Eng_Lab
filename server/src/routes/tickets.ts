import { Router } from "express";
import { Prisma, RequestedPriority } from "@prisma/client";
import { prisma } from "../db";
import { generateTicketNumber } from "../lib/ticketNumber";

export const ticketsRouter: Router = Router();

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const SUMMARY_MAX = 120;
const DESCRIPTION_MAX = 2000;
const NUMBER_ATTEMPTS = 5;

interface FieldError {
  field: string;
  message: string;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

ticketsRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const details: FieldError[] = [];
  const add = (field: string, message: string) => details.push({ field, message });

  const requesterId = toPositiveInt(body.requesterId);
  if (requesterId === null) add("requesterId", "Requester is required");

  const categoryId = toPositiveInt(body.categoryId);
  if (categoryId === null) add("categoryId", "Category is required");

  const relatedSystemId = toPositiveInt(body.relatedSystemId);
  if (relatedSystemId === null) add("relatedSystemId", "Related system is required");

  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (summary.length === 0) add("summary", "Summary is required");
  else if (summary.length > SUMMARY_MAX) add("summary", `Summary must be ${SUMMARY_MAX} characters or fewer`);

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length === 0) add("description", "Description is required");
  else if (description.length > DESCRIPTION_MAX)
    add("description", `Description must be ${DESCRIPTION_MAX} characters or fewer`);

  const requestedPriority = body.requestedPriority;
  if (typeof requestedPriority !== "string" || !PRIORITIES.includes(requestedPriority)) {
    add("requestedPriority", "Requested priority must be LOW, MEDIUM, HIGH, or URGENT");
  }

  if (requesterId !== null) {
    const requester = await prisma.requesterUser.findUnique({ where: { id: requesterId } });
    if (!requester) add("requesterId", "Requester not found");
    else if (!requester.active) add("requesterId", "Requester is not active");
  }

  if (categoryId !== null) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) add("categoryId", "Category not found");
  }

  if (relatedSystemId !== null) {
    const system = await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } });
    if (!system) add("relatedSystemId", "Related system not found");
    else if (!system.active) add("relatedSystemId", "Related system is not active");
  }

  if (details.length > 0) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Ticket payload is invalid",
        details,
      },
    });
    return;
  }

  try {
    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
      const ticketNumber = await generateTicketNumber(prisma, attempt);
      try {
        const ticket = await prisma.ticket.create({
          data: {
            ticketNumber,
            requesterId: requesterId as number,
            categoryId: categoryId as number,
            relatedSystemId: relatedSystemId as number,
            summary,
            description,
            requestedPriority: requestedPriority as RequestedPriority,
          },
        });
        res.status(201).json(ticket);
        return;
      } catch (err) {
        const isUnique =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isUnique) throw err;
      }
    }
    throw new Error("ticket number allocation exhausted");
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to create ticket",
      },
    });
  }
});
