import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/db";
import { hashPassword } from "../src/lib/password";

// Cheap hashing in tests; production default stays 12 (AD-03).
process.env.BCRYPT_COST = "4";

export const TEST_PASSWORD = "Test12345!";

// Creates (or resets) a login-capable REQUESTER for header-era tests that now
// authenticate with cookies. mustChangePassword is false so the fresh gate
// never interferes with Lab 2 regression flows.
export async function createLoginUser(email: string, name: string, active = true) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await prisma.session.deleteMany({ where: { user: { email } } });
  return prisma.user.upsert({
    where: { email },
    update: { name, active, role: "REQUESTER", passwordHash, mustChangePassword: false },
    create: { email, name, active, role: "REQUESTER", passwordHash, mustChangePassword: false },
  });
}

export async function loginAgent(app: Express, email: string, password: string = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export type TestAgent = Awaited<ReturnType<typeof loginAgent>>;
