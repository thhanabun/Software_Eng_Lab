import { describe, expect, it } from "vitest";
import { ACTIVE_WORK_STATUSES, canTransition, isValidStatus, legalTargets, type TicketStatusValue } from "./transitions";

describe("transition matrix (UNIT-03, BR-17)", () => {
  it("accepts every matrix edge", () => {
    const edges: Array<[TicketStatusValue, TicketStatusValue]> = [
      ["NEW", "OPEN"],
      ["NEW", "CANCELLED"],
      ["OPEN", "IN_PROGRESS"],
      ["OPEN", "WAITING_FOR_REQUESTER"],
      ["OPEN", "CANCELLED"],
      ["IN_PROGRESS", "WAITING_FOR_REQUESTER"],
      ["IN_PROGRESS", "RESOLVED"],
      ["IN_PROGRESS", "CANCELLED"],
      ["WAITING_FOR_REQUESTER", "IN_PROGRESS"],
      ["WAITING_FOR_REQUESTER", "CANCELLED"],
      ["RESOLVED", "CLOSED"],
      ["RESOLVED", "REOPENED"],
      ["CLOSED", "REOPENED"],
      ["REOPENED", "IN_PROGRESS"],
      ["REOPENED", "CANCELLED"],
    ];
    for (const [from, to] of edges) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it("rejects off-matrix pairs and the terminal CANCELLED state", () => {
    expect(canTransition("NEW", "RESOLVED")).toBe(false);
    expect(canTransition("CLOSED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("RESOLVED", "OPEN")).toBe(false);
    expect(legalTargets("CANCELLED")).toEqual([]);
  });

  it("validates status values and flags active-work statuses", () => {
    expect(isValidStatus("OPEN")).toBe(true);
    expect(isValidStatus("WHENEVER")).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
    expect(ACTIVE_WORK_STATUSES).toContain("OPEN");
    expect(ACTIVE_WORK_STATUSES).not.toContain("NEW");
    expect(ACTIVE_WORK_STATUSES).not.toContain("CANCELLED");
  });
});
