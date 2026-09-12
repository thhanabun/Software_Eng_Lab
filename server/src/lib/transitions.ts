// Permitted Ticket status transitions (BR-17). Single source of truth for the
// PATCH /api/staff/tickets/:id/status route and its UNIT-03 tests.

export const STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

export type TicketStatusValue = (typeof STATUSES)[number];

const MATRIX: Record<TicketStatusValue, TicketStatusValue[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "CANCELLED"],
  CANCELLED: [],
};

export function isValidStatus(value: unknown): value is TicketStatusValue {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

// Active-work statuses that return to NEW when unassigned (AD-13).
export const ACTIVE_WORK_STATUSES: TicketStatusValue[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
];

export function legalTargets(from: TicketStatusValue): TicketStatusValue[] {
  return MATRIX[from] ?? [];
}

export function canTransition(from: TicketStatusValue, to: TicketStatusValue): boolean {
  return legalTargets(from).includes(to);
}
