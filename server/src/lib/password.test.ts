import { describe, expect, it } from "vitest";
import { normalizeEmail, validateNewPassword } from "./password";

describe("validateNewPassword (UNIT-02, BR-09)", () => {
  it("accepts a valid password", () => {
    expect(validateNewPassword("Requester123!")).toEqual([]);
  });

  it("rejects missing passwords", () => {
    expect(validateNewPassword(undefined)).toHaveLength(1);
    expect(validateNewPassword("")).toHaveLength(1);
  });

  it("rejects out-of-range lengths", () => {
    expect(validateNewPassword("Ab1defg")).toHaveLength(1); // 7 chars
    expect(validateNewPassword(`A1${"x".repeat(71)}`)).toHaveLength(1); // 73 chars
  });

  it("rejects letter-only and digit-only passwords", () => {
    expect(validateNewPassword("abcdefgh")).toHaveLength(1);
    expect(validateNewPassword("12345678")).toHaveLength(1);
  });

  it("rejects reuse of the current password", () => {
    const issues = validateNewPassword("Same12345", "Same12345");
    expect(issues.some((i) => i.message.includes("differ"))).toBe(true);
  });

  it("accepts boundary lengths 8 and 72", () => {
    expect(validateNewPassword("Ab345678")).toEqual([]);
    expect(validateNewPassword(`A1${"x".repeat(70)}`)).toEqual([]);
  });
});

describe("normalizeEmail", () => {
  it("lowercases, trims, and validates shape", () => {
    expect(normalizeEmail("  Alice@Example.TEST ")).toBe("alice@example.test");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});
