import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireFreshPassword, requireRole } from "../lib/auth";
import { internalError } from "../lib/validation";

export const dashboardRouter: Router = Router();

const requesterOnly = [requireAuth, requireRole("REQUESTER"), requireFreshPassword];
const staffOnly = [requireAuth, requireRole("IT_STAFF", "ADMINISTRATOR"), requireFreshPassword];

const OPEN_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const;
const ALL_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function iso(d: Date): string {
  return d.toISOString();
}

type TicketListRow = {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: string;
  updatedAt: Date;
};

function serializeRows(rows: TicketListRow[], base: string) {
  return rows.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    summary: t.summary,
    currentStatus: t.currentStatus,
    updatedAt: iso(t.updatedAt),
    drillDown: { base: `${base}/${t.id}`, query: "" },
  }));
}

// GET /api/dashboard/requester — owned summary (REQUESTER only).
dashboardRouter.get("/requester", ...requesterOnly, async (req, res) => {
  try {
    const userId = req.user!.id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [open, waiting, resolved30d, recentUpdated, recentResolved, attention] = await Promise.all([
      prisma.ticket.count({ where: { requesterId: userId, currentStatus: { in: [...OPEN_STATUSES] } } }),
      prisma.ticket.count({ where: { requesterId: userId, currentStatus: "WAITING_FOR_REQUESTER" } }),
      prisma.ticket.count({
        where: { requesterId: userId, currentStatus: { in: ["RESOLVED", "CLOSED"] }, updatedAt: { gte: thirtyDaysAgo } },
      }),
      prisma.ticket.findMany({
        where: { requesterId: userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true },
      }),
      prisma.ticket.findMany({
        where: { requesterId: userId, currentStatus: { in: ["RESOLVED", "CLOSED"] } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true },
      }),
      prisma.ticket.findMany({
        where: { requesterId: userId, currentStatus: "WAITING_FOR_REQUESTER" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true },
      }),
    ]);
    res.json({
      metrics: { open, waitingForRequester: waiting, resolved30d },
      recentUpdated: serializeRows(recentUpdated, "/tickets"),
      recentResolved: serializeRows(recentResolved, "/tickets"),
      attention: attention.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        reason: "WAITING_FOR_REQUESTER" as const,
        drillDown: { base: `/tickets/${t.id}`, query: "" },
      })),
    });
  } catch {
    internalError(res, "Unable to load requester dashboard");
  }
});

// GET /api/dashboard/staff — operational summary (IT_STAFF, ADMINISTRATOR).
dashboardRouter.get("/staff", ...staffOnly, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [unassigned, ownedByMe, byStatusRows, byPriorityRows, recentUpdated, urgentUnassigned] = await Promise.all([
      prisma.ticket.count({ where: { ownerId: null } }),
      prisma.ticket.count({ where: { ownerId: userId } }),
      prisma.ticket.groupBy({ by: ["currentStatus"], _count: { currentStatus: true } }),
      prisma.ticket.groupBy({ by: ["itPriority"], _count: { itPriority: true } }),
      prisma.ticket.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true },
      }),
      prisma.ticket.findMany({
        where: { ownerId: null, itPriority: { in: ["URGENT", "HIGH"] } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true },
      }),
    ]);
    const byStatus: Record<string, number> = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
    for (const row of byStatusRows) byStatus[row.currentStatus] = row._count.currentStatus;
    const byItPriority: Record<string, number> = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
    for (const row of byPriorityRows) byItPriority[row.itPriority] = row._count.itPriority;

    const body: Record<string, unknown> = {
      metrics: {
        unassigned,
        ownedByMe,
        byStatus,
        byItPriority,
        drillDown: {
          unassigned: { base: "/staff/tickets", query: "?ownerId=unassigned" },
          ownedByMe: { base: "/staff/tickets", query: `?ownerId=${userId}` },
        },
      },
      recentUpdated: serializeRows(recentUpdated, "/staff/tickets"),
      urgentUnassigned: serializeRows(urgentUnassigned, "/staff/tickets"),
    };
    if (req.user!.role === "ADMINISTRATOR") {
      const [requesters, staff, admins, inactive] = await Promise.all([
        prisma.user.count({ where: { role: "REQUESTER", active: true } }),
        prisma.user.count({ where: { role: "IT_STAFF", active: true } }),
        prisma.user.count({ where: { role: "ADMINISTRATOR", active: true } }),
        prisma.user.count({ where: { active: false } }),
      ]);
      body.userCounts = { requesters, staff, admins, inactive };
    }
    res.json(body);
  } catch {
    internalError(res, "Unable to load staff dashboard");
  }
});
