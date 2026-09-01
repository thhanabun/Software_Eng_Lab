import { describe, expect, it } from "vitest";
import { formatTicketNumber, generateTicketNumber, todayStamp } from "./ticketNumber";

describe("UNIT-01: ticket number generator", () => {
  it("formats a zero-padded daily sequence number", () => {
    expect(formatTicketNumber("20260823", 7)).toBe("TKT-20260823-0007");
    expect(formatTicketNumber("20260823", 1)).toBe("TKT-20260823-0001");
    expect(formatTicketNumber("20260823", 42)).toBe("TKT-20260823-0042");
  });

  it("renders a YYYYMMDD stamp for a fixed date", () => {
    expect(todayStamp(new Date(2026, 7, 23))).toBe("20260823");
    expect(todayStamp(new Date(2026, 0, 5))).toBe("20260105");
  });

  it("generates the next sequence after existing tickets of the day", async () => {
    const fakePrisma = {
      ticket: {
        count: async () => 2,
      },
    };
    const generated = await generateTicketNumber(fakePrisma as never);
    expect(generated).toMatch(/^TKT-\d{8}-\d{4}$/);
    expect(generated).toBe(`TKT-${todayStamp()}-0003`);
  });

  it("supports collision offsets past the current count", async () => {
    const fakePrisma = {
      ticket: {
        count: async () => 5,
      },
    };
    const generated = await generateTicketNumber(fakePrisma as never, 2);
    expect(generated).toBe(`TKT-${todayStamp()}-0008`);
  });
});
