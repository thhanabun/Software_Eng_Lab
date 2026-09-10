import bcrypt from "bcryptjs";

export const PLACEHOLDER_HASH = "MIGRATION_PENDING_RESET";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export interface PasswordIssue {
  field: string;
  message: string;
}

function cost(): number {
  const raw = Number(process.env.BCRYPT_COST ?? 12);
  return Number.isInteger(raw) && raw >= 4 && raw <= 14 ? raw : 12;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, cost());
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || hash === PLACEHOLDER_HASH) return false;
  return bcrypt.compare(plain, hash);
}

// BR-09: 8-72 chars, at least one letter and one digit.
export function validateNewPassword(newPassword: unknown, currentPassword?: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (typeof newPassword !== "string" || newPassword.length === 0) {
    return [{ field: "newPassword", message: "New password is required" }];
  }
  if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
    issues.push({
      field: "newPassword",
      message: `New password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`,
    });
  }
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    issues.push({
      field: "newPassword",
      message: "New password must contain at least one letter and one digit",
    });
  }
  if (typeof currentPassword === "string" && currentPassword.length > 0 && newPassword === currentPassword) {
    issues.push({
      field: "newPassword",
      message: "New password must differ from the current password",
    });
  }
  return issues;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
