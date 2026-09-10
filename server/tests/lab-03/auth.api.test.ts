import { beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { requireAuth, requireFreshPassword } from "../../src/lib/auth";
import { hashPassword } from "../../src/lib/password";
import { SEED_INITIAL_PASSWORD, seedAll } from "../../prisma/seed";

// Cheap hashing in tests; production default stays 12 (AD-03).
process.env.BCRYPT_COST = "4";

const KNOWN_PASSWORD = "Requester123!";

let app: express.Express;
let probe: express.Express;

async function ensureUser(email: string, data: { name: string; role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; active: boolean; mustChangePassword: boolean }) {
  const passwordHash = await hashPassword(KNOWN_PASSWORD);
  await prisma.session.deleteMany({ where: { user: { email } } });
  return prisma.user.upsert({
    where: { email },
    update: { ...data, passwordHash },
    create: { email, passwordHash, ...data },
  });
}

beforeAll(async () => {
  app = createApp();
  // Probe app: exercises the auth middleware contract (AUTH-06/08) before
  // the middlewares are wired onto product routes in Issue #31.
  probe = express();
  probe.use(express.json());
  const cookieParser = (await import("cookie-parser")).default;
  probe.use(cookieParser());
  probe.get("/probe", requireAuth, requireFreshPassword, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  await seedAll(prisma);
  await ensureUser("auth-req@example.test", { name: "Auth Requester", role: "REQUESTER", active: true, mustChangePassword: false });
  await ensureUser("auth-new@example.test", { name: "Auth New", role: "REQUESTER", active: true, mustChangePassword: true });
  await ensureUser("auth-off@example.test", { name: "Auth Off", role: "REQUESTER", active: false, mustChangePassword: false });
  await ensureUser("auth-staff@example.test", { name: "Auth Staff", role: "IT_STAFF", active: true, mustChangePassword: false });
  await ensureUser("auth-admin@example.test", { name: "Auth Admin", role: "ADMINISTRATOR", active: true, mustChangePassword: false });
});

describe("POST /api/auth/login (AUTH-01)", () => {
  it.each([
    ["auth-req@example.test", "REQUESTER"],
    ["auth-staff@example.test", "IT_STAFF"],
    ["auth-admin@example.test", "ADMINISTRATOR"],
  ])("logs in %s with session cookie and safe user", async (email, role) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: KNOWN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, role, active: true });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("tokenHash");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.join(";")).toMatch(/toktickit_session=[^;]+;.*HttpOnly/i);
  });

  it("returns 400 for malformed bodies", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("answers malformed JSON with the safe error shape, never HTML (BR-29)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not-valid-json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules/i);
  });
});

describe("login failures (AUTH-02, AUTH-03)", () => {
  it("returns an identical generic 401 for unknown email and wrong password (AUTH-02)", async () => {
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody-here@example.test", password: KNOWN_PASSWORD });
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "auth-req@example.test", password: "Wrong12345" });
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.message).toBe("Invalid email or password");
  });

  it("rejects inactive accounts with 403 and a clear message (AUTH-03)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "auth-off@example.test", password: KNOWN_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.message).toMatch(/deactivated/i);
  });
});

describe("logout + session lifecycle (AUTH-04, AUTH-05)", () => {
  it("logout invalidates the session; later access is rejected (AUTH-04)", async () => {
    const authed = request.agent(app);
    const login = await authed.post("/api/auth/login").send({ email: "auth-req@example.test", password: KNOWN_PASSWORD });
    expect(login.status).toBe(200);

    const me = await authed.get("/api/auth/me");
    expect(me.status).toBe(200);

    const logout = await authed.post("/api/auth/logout");
    expect(logout.status).toBe(200);

    expect((await authed.get("/api/auth/me")).status).toBe(401);
    // Idempotent: logging out again is still 200.
    expect((await authed.post("/api/auth/logout")).status).toBe(200);
  });

  it("rejects expired/unknown tokens with 401 (AUTH-05)", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", "toktickit_session=deadbeef");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("must-change gate (AUTH-06, AUTH-10)", () => {
  it("flags initial-password login and gates normal APIs (AUTH-06)", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email: "auth-new@example.test", password: KNOWN_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    expect((await agent.get("/api/auth/me")).status).toBe(200);
    const gated = await request(probe).get("/probe").set("Cookie", login.headers["set-cookie"] as unknown as string[]);
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("a freshly flagged account is gated at next login (AUTH-10)", async () => {
    await prisma.user.update({
      where: { email: "auth-req@example.test" },
      data: { mustChangePassword: true },
    });
    try {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "auth-req@example.test", password: KNOWN_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);
      const gated = await request(probe).get("/probe").set("Cookie", login.headers["set-cookie"] as unknown as string[]);
      expect(gated.status).toBe(403);
    } finally {
      await prisma.user.update({
        where: { email: "auth-req@example.test" },
        data: { mustChangePassword: false },
      });
    }
  });
});

describe("POST /api/auth/change-password (AUTH-07, AUTH-08, AUTH-09)", () => {
  it("rejects weak, mismatched, reused, and current-less input (AUTH-07)", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "auth-req@example.test", password: KNOWN_PASSWORD });

    for (const body of [
      { currentPassword: KNOWN_PASSWORD, newPassword: "short1", confirmPassword: "short1" },
      { currentPassword: KNOWN_PASSWORD, newPassword: "NoDigitsHere", confirmPassword: "NoDigitsHere" },
      { currentPassword: KNOWN_PASSWORD, newPassword: KNOWN_PASSWORD, confirmPassword: KNOWN_PASSWORD },
      { currentPassword: KNOWN_PASSWORD, newPassword: "Valid12345", confirmPassword: "Different123" },
      { newPassword: "Valid12345", confirmPassword: "Valid12345" },
    ]) {
      const res = await agent.post("/api/auth/change-password").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }

    const wrongCurrent = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "Wrong12345", newPassword: "Valid12345", confirmPassword: "Valid12345" });
    expect(wrongCurrent.status).toBe(403);

    // Pending-initial flow also verifies the initial password (BR-09 differ).
    const pending = request.agent(app);
    await pending.post("/api/auth/login").send({ email: "auth-new@example.test", password: KNOWN_PASSWORD });
    const pendingWrong = await pending
      .post("/api/auth/change-password")
      .send({ currentPassword: "Wrong12345", newPassword: "Valid12345", confirmPassword: "Valid12345" });
    expect(pendingWrong.status).toBe(403);
    const pendingReuse = await pending
      .post("/api/auth/change-password")
      .send({ currentPassword: KNOWN_PASSWORD, newPassword: KNOWN_PASSWORD, confirmPassword: KNOWN_PASSWORD });
    expect(pendingReuse.status).toBe(400);
  });

  it("clears the flag, rehashes, and kills sibling sessions (AUTH-08)", async () => {
    const first = request.agent(app);
    const second = request.agent(app);
    await first.post("/api/auth/login").send({ email: "auth-new@example.test", password: KNOWN_PASSWORD });
    const secondLogin = await second.post("/api/auth/login").send({ email: "auth-new@example.test", password: KNOWN_PASSWORD });
    const secondCookie = secondLogin.headers["set-cookie"] as unknown as string[];

    const changed = await first
      .post("/api/auth/change-password")
      .send({ currentPassword: KNOWN_PASSWORD, newPassword: "BrandNew123", confirmPassword: "BrandNew123" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // Sibling session is dead.
    expect((await request(probe).get("/probe").set("Cookie", secondCookie)).status).toBe(401);
    // New password works and the gate is open for the changer.
    const relogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "auth-new@example.test", password: "BrandNew123" });
    expect(relogin.status).toBe(200);
    expect(relogin.body.user.mustChangePassword).toBe(false);
    expect((await request(probe).get("/probe").set("Cookie", relogin.headers["set-cookie"] as unknown as string[])).status).toBe(200);

    // Restore the fixture password for other tests.
    await prisma.user.update({
      where: { email: "auth-new@example.test" },
      data: { passwordHash: await hashPassword(KNOWN_PASSWORD), mustChangePassword: true },
    });
  });

  it("enforces password boundaries 7/8/72/73 (AUTH-09)", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "auth-req@example.test", password: KNOWN_PASSWORD });
    const change = (pw: string) =>
      agent.post("/api/auth/change-password").send({ currentPassword: KNOWN_PASSWORD, newPassword: pw, confirmPassword: pw });

    expect((await change("Ab1defg")).status).toBe(400); // 7
    expect((await change("12345678")).status).toBe(400); // digit-only
    expect((await change("abcdefgh")).status).toBe(400); // letter-only
    expect((await change(`A1${"x".repeat(71)}`)).status).toBe(400); // 73

    await prisma.user.update({
      where: { email: "auth-req@example.test" },
      data: { passwordHash: await hashPassword(KNOWN_PASSWORD) },
    });
  });
});

describe("seeded accounts can log in (MIG-02 support)", () => {
  it("dev initial password opens the forced-change flow", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice.carter@student.example", password: SEED_INITIAL_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });
});
