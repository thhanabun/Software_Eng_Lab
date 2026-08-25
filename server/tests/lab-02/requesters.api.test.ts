import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";

describe("GET /api/requesters (API-01)", () => {
  it("returns 200 with only active development requesters ordered by name", async () => {
    const res = await request(createApp()).get("/api/requesters");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    for (const requester of res.body) {
      expect(requester).toHaveProperty("id");
      expect(typeof requester.name).toBe("string");
      expect(typeof requester.email).toBe("string");
    }

    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("excludes inactive requesters from the response", async () => {
    const inactive = await prisma.requesterUser.findMany({
      where: { active: false },
    });
    expect(inactive.length).toBeGreaterThanOrEqual(1);

    const res = await request(createApp()).get("/api/requesters");
    const returnedIds = res.body.map((r: { id: number }) => r.id);

    for (const excluded of inactive) {
      expect(returnedIds).not.toContain(excluded.id);
    }
  });
});

describe("Lab 2 seed idempotency (API-02)", () => {
  it("re-running the seed creates no duplicates", async () => {
    const before = {
      categories: await prisma.category.count(),
      systems: await prisma.relatedSystem.count(),
      requesters: await prisma.requesterUser.count(),
    };

    await seedAll(prisma);
    await seedAll(prisma);

    expect(await prisma.category.count()).toBe(before.categories);
    expect(await prisma.relatedSystem.count()).toBe(before.systems);
    expect(await prisma.requesterUser.count()).toBe(before.requesters);
  });

  it("seeded reference data meets Lab 2 minimums", async () => {
    const categories = await prisma.category.count();
    const systems = await prisma.relatedSystem.count();
    const activeRequesters = await prisma.requesterUser.count({
      where: { active: true },
    });
    const inactiveRequesters = await prisma.requesterUser.count({
      where: { active: false },
    });

    expect(categories).toBeGreaterThanOrEqual(4);
    expect(systems).toBeGreaterThanOrEqual(6);
    expect(activeRequesters).toBeGreaterThanOrEqual(4);
    expect(inactiveRequesters).toBeGreaterThanOrEqual(1);
  });
});
