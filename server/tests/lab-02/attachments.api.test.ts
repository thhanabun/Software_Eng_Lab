import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db";
import { seedAll } from "../../prisma/seed";
import { UPLOADS_DIR } from "../../src/lib/attachments";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TOO_BIG = Buffer.alloc(5 * 1024 * 1024 + 1, 0x50);

let app: Express;
let requesterId: number;
let strangerId: number;
let ticketId: number;

function png(name: string) {
  return { filename: name, contentType: "image/png", buffer: PNG_MAGIC };
}

function upload(name = "photo.png", buffer: Buffer = PNG_MAGIC, contentType = "image/png") {
  return request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set("X-Requester-Id", String(requesterId))
    .attach("file", buffer, { filename: name, contentType });
}

async function makeTicket(requester: number): Promise<number> {
  const hardware = await prisma.category.findUniqueOrThrow({ where: { name: "Hardware" } });
  const laptop = await prisma.relatedSystem.findUniqueOrThrow({
    where: { name: "Corporate Laptop" },
  });
  const res = await request(app)
    .post("/api/tickets")
    .send({
      requesterId: requester,
      categoryId: hardware.id,
      relatedSystemId: laptop.id,
      summary: "Attachment lifecycle ticket",
      description: "Ticket used by the attachment API tests.",
      requestedPriority: "LOW",
    });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

beforeAll(async () => {
  app = createApp();
  await seedAll(prisma);
  requesterId = (
    await prisma.requesterUser.upsert({
      where: { email: "attach-owner@student.example" },
      update: { active: true },
      create: { name: "Attach Owner", email: "attach-owner@student.example", active: true },
    })
  ).id;
  strangerId = (
    await prisma.requesterUser.upsert({
      where: { email: "attach-stranger@student.example" },
      update: { active: true },
      create: { name: "Attach Stranger", email: "attach-stranger@student.example", active: true },
    })
  ).id;
  ticketId = await makeTicket(requesterId);
});

async function removeAllAttachments() {
  const rows = await prisma.attachment.findMany({
    where: { ticket: { requesterId: { in: [requesterId, strangerId] } } },
  });
  for (const row of rows) {
    await fs.promises.rm(path.join(UPLOADS_DIR, row.storedName), { force: true }).catch(() => undefined);
  }
  await prisma.attachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
}

beforeEach(removeAllAttachments);

afterAll(async () => {
  await removeAllAttachments();
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterId, strangerId] } } });
  await prisma.requesterUser.deleteMany({ where: { id: { in: [requesterId, strangerId] } } });
});

describe("POST /api/tickets/:id/attachments (API-17..20)", () => {
  it("stores a valid upload as uuid.ext with metadata retained (API-17)", async () => {
    const res = await upload("battery-report.png");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketId: ticketId,
      originalName: "battery-report.png",
      mimeType: "image/png",
      sizeBytes: PNG_MAGIC.length,
      removedAt: null,
      removalReason: null,
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body).not.toHaveProperty("storedName");

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.storedName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(fs.existsSync(path.join(UPLOADS_DIR, row.storedName))).toBe(true);
  });

  it("rejects a wrong file type with 415 and stores nothing (API-18)", async () => {
    const res = await upload("notes.txt", Buffer.from("hello"), "text/plain");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA");

    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
    expect(fs.readdirSync(UPLOADS_DIR).some((f) => f.endsWith(".txt"))).toBe(false);
  });

  it("rejects an oversize file with 413 and stores nothing (API-19)", async () => {
    const res = await upload("huge.png", TOO_BIG);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");

    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });

  it("rejects the sixth active attachment with 409 until one is removed (API-20)", async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await upload(`active-${i}.png`);
      expect(res.status).toBe(201);
    }

    const sixth = await upload("sixth.png");
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("CONFLICT");

    const list = await request(app)
      .get(`/api/tickets/${ticketId}/attachments`)
      .set("X-Requester-Id", String(requesterId));
    const first = list.body[0] as { id: number };

    const removed = await request(app)
      .delete(`/api/attachments/${first.id}`)
      .set("X-Requester-Id", String(requesterId))
      .send({ reason: "Uploaded the wrong screenshot" });
    expect(removed.status).toBe(200);

    const afterRemoval = await upload("replacement.png");
    expect(afterRemoval.status).toBe(201);
  });

  it("enforces ticket ownership before accepting an upload", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("X-Requester-Id", String(strangerId))
      .attach("file", PNG_MAGIC, { filename: "steal.png", contentType: "image/png" });
    expect(res.status).toBe(404);
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });
});

describe("Attachment lifecycle endpoints (API-21..24)", () => {
  async function uploadOne(name = "pic.png"): Promise<number> {
    const res = await upload(name);
    expect(res.status).toBe(201);
    return res.body.id as number;
  }

  it("lists active and removed attachments with reason retained (API-21)", async () => {
    const older = await uploadOne("older.png");
    const newer = await uploadOne("newer.png");
    await request(app)
      .delete(`/api/attachments/${older}`)
      .set("X-Requester-Id", String(requesterId))
      .send({ reason: "duplicate upload" });

    const list = await request(app)
      .get(`/api/tickets/${ticketId}/attachments`)
      .set("X-Requester-Id", String(requesterId));
    expect(list.status).toBe(200);

    const ids = (list.body as { id: number }[]).map((a) => a.id);
    expect(ids).toEqual([newer, older]);
    const removedEntry = (list.body as { id: number; removedAt: string | null; removalReason: string | null }[]).find(
      (a) => a.id === older,
    );
    expect(removedEntry?.removedAt).not.toBeNull();
    expect(removedEntry?.removalReason).toBe("duplicate upload");
  });

  it("downloads an active attachment with original name and type (API-22)", async () => {
    const id = await uploadOne("battery-report.png");
    const res = await request(app)
      .get(`/api/attachments/${id}/download`)
      .set("X-Requester-Id", String(requesterId));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["content-disposition"]).toContain("battery-report.png");
    expect(res.body.equals(PNG_MAGIC)).toBe(true);
  });

  it("returns 410 for downloading a removed attachment (API-23)", async () => {
    const id = await uploadOne("gone.png");
    await request(app)
      .delete(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(requesterId))
      .send({ reason: "no longer relevant" });

    const download = await request(app)
      .get(`/api/attachments/${id}/download`)
      .set("X-Requester-Id", String(requesterId));
    expect(download.status).toBe(410);
    expect(download.body.error.code).toBe("GONE");

    const metadata = await request(app)
      .get(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(requesterId));
    expect(metadata.status).toBe(200);
  });

  it("soft removal requires a reason, keeps metadata, and blocks re-removal (API-24)", async () => {
    const id = await uploadOne("remove-me.png");

    const noReason = await request(app)
      .delete(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(requesterId))
      .send({ reason: "   " });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.details[0].field).toBe("reason");

    const tooLong = await request(app)
      .delete(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(requesterId))
      .send({ reason: "x".repeat(201) });
    expect(tooLong.status).toBe(400);

    const removed = await request(app)
      .delete(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(requesterId))
      .send({ reason: "contains a personal phone number" });
    expect(removed.status).toBe(200);
    expect(removed.body.removedAt).not.toBeNull();
    expect(removed.body.removalReason).toBe("contains a personal phone number");

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    expect(fs.existsSync(path.join(UPLOADS_DIR, row.storedName))).toBe(true);

    const again = await request(app)
      .delete(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(requesterId))
      .send({ reason: "twice" });
    expect(again.status).toBe(409);
  });

  it("never leaks another requester's attachment (404 on metadata and download)", async () => {
    const id = await uploadOne("private.png");

    const meta = await request(app)
      .get(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(strangerId));
    expect(meta.status).toBe(404);

    const download = await request(app)
      .get(`/api/attachments/${id}/download`)
      .set("X-Requester-Id", String(strangerId));
    expect(download.status).toBe(404);

    const remove = await request(app)
      .delete(`/api/attachments/${id}`)
      .set("X-Requester-Id", String(strangerId))
      .send({ reason: "not mine" });
    expect(remove.status).toBe(404);
  });
});
