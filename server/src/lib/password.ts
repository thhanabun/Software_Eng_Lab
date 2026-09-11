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
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // Garbage stored hash: fail closed, never throw (BR-29).
    return false;
  }
}

// Precomputed cost-12 hash of a random dummy password. Compared when the
// account does not exist so unknown-email and wrong-password logins cost the
// same time (no enumeration oracle, BR-06).
const DUMMY_HASH = "$2b$12$R437yr2Mdpnc2GFp05GJCeUMktd/R89v62eUMUWRKsP5ew2R5p6jW";

export async function verifyLoginPassword(plain: string, storedHash: string | null): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, storedHash ?? DUMMY_HASH);
  } catch {
    return false;
  }
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
