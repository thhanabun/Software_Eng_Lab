export function todayStamp(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function formatTicketNumber(stamp: string, sequence: number): string {
  return `TKT-${stamp}-${String(sequence).padStart(4, "0")}`;
}

interface TicketCounter {
  ticket: {
    count: (args: { where: { ticketNumber: { startsWith: string } } }) => Promise<number>;
  };
}

export async function generateTicketNumber(db: TicketCounter, extra = 0): Promise<string> {
  const stamp = todayStamp();
  const prefix = `TKT-${stamp}-`;
  const existing = await db.ticket.count({ where: { ticketNumber: { startsWith: prefix } } });
  return formatTicketNumber(stamp, existing + 1 + extra);
}
