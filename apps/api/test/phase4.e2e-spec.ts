import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * E2E: Phase 4 modules — media upload tickets, posts, comments,
 * templates, configurations, scheduled jobs, workspace isolation.
 * Queue enqueue uses real Redis/BullMQ; no worker is required here.
 * Run: pnpm --filter @scm/api test:e2e
 */
describe("Phase 4 — publishing pipeline (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const email = `p4-${Date.now()}@test.dev`;
  const email2 = `p4b-${Date.now()}@test.dev`;
  const password = "Str0ng!Pass";
  let token = "";
  let token2 = "";
  let workspaceId = "";
  let pageId = "";
  let postId = "";

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const e of [email, email2]) {
      const user = await prisma.user.findUnique({ where: { email: e } });
      if (user) {
        await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it("register user A and seed a disabled-but-real social page", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ email, password, displayName: "P4 User", workspaceName: "P4 Shop" })
      .expect(201);
    token = res.body.tokens.accessToken;
    const member = await prisma.workspaceMember.findFirst({ where: { user: { email } } });
    workspaceId = member!.workspaceId;

    // second user + workspace for isolation checks
    const res2 = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ email: email2, password, displayName: "Other", workspaceName: "Other Shop" })
      .expect(201);
    token2 = res2.body.tokens.accessToken;

    const acct = await prisma.socialAccount.create({
      data: {
        workspaceId,
        connectedBy: res.body.user.id,
        provider: "facebook",
        displayName: "E2E FB Account",
        providerUserId: "fb-user-e2e",
        status: "active",
        scopes: ["pages_manage_posts"],
      },
    });
    const page = await prisma.socialPage.create({
      data: {
        workspaceId,
        socialAccountId: acct.id,
        pageId: "999000111",
        name: "E2E Page",
        isEnabled: true,
        permissions: ["CREATE_CONTENT"],
        tasks: ["MANAGE"],
      },
    });
    pageId = page.id;
  });

  // ---------- media ----------
  it("rejects an unsupported mime type on upload ticket", async () => {
    await request(app.getHttpServer())
      .post("/api/media/uploads")
      .set(auth())
      .send({ fileName: "evil.exe", mimeType: "application/x-msdownload", sizeBytes: 100 })
      .expect(400);
  });

  it("issues a presigned upload ticket for a png", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/media/uploads")
      .set(auth())
      .send({ fileName: "dress.png", mimeType: "image/png", sizeBytes: 2048, category: "dresses" })
      .expect(201);
    expect(res.body.mediaId).toMatch(/[0-9a-f-]{36}/);
    expect(res.body.uploadUrl).toContain("http");
    const row = await prisma.mediaAsset.findUnique({ where: { id: res.body.mediaId } });
    expect(row?.status).toBe("processing");
    expect(row?.workspaceId).toBe(workspaceId);
  });

  // ---------- posts ----------
  it("rejects a text post carrying mediaIds (contract refine)", async () => {
    await request(app.getHttpServer())
      .post("/api/posts")
      .set(auth())
      .send({ kind: "text", body: "x", pageIds: [pageId], mediaIds: [crypto.randomUUID()] })
      .expect(400);
  });

  it("rejects a post to a page outside the workspace", async () => {
    await request(app.getHttpServer())
      .post("/api/posts")
      .set(auth())
      .send({ kind: "text", body: "x", pageIds: [crypto.randomUUID()] })
      .expect(404);
  });

  it("creates a multi-page post and enqueues per-page jobs", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/posts")
      .set(auth())
      .send({ kind: "text", body: "hello page", pageIds: [pageId], idempotencyKey: "e2e-post-1" })
      .expect(202);
    postId = res.body.id;
    expect(res.body.status).toBe("queued");
    expect(res.body.pages).toHaveLength(1);
    expect(res.body.pages[0].status).toBe("queued");

    const jobs = await prisma.scheduledJob.findMany({ where: { workspaceId } });
    expect(jobs.some((j) => j.kind === "publish_post" && j.queueJobId?.startsWith("pp-"))).toBe(true);
  });

  it("is idempotent — same key returns the same post", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/posts")
      .set(auth())
      .send({ kind: "text", body: "duplicate attempt", pageIds: [pageId], idempotencyKey: "e2e-post-1" })
      .expect(202);
    expect(res.body.id).toBe(postId);
  });

  it("hides the post from another workspace's token", async () => {
    await request(app.getHttpServer())
      .get(`/api/posts/${postId}`)
      .set({ Authorization: `Bearer ${token2}` })
      .expect(404);
  });

  // ---------- comments ----------
  it("creates a comment job against a target fb object", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/comments")
      .set(auth())
      .send({ pageId, fbTargetId: "999000111_123456", body: "nice!", idempotencyKey: "e2e-cm-1" })
      .expect(202);
    expect(res.body.status).toBe("queued");
    const jobs = await prisma.scheduledJob.findMany({ where: { workspaceId, kind: "publish_comment" } });
    expect(jobs.length).toBeGreaterThan(0);
  });

  it("rejects a comment with neither body nor media", async () => {
    await request(app.getHttpServer())
      .post("/api/comments")
      .set(auth())
      .send({ pageId, fbTargetId: "999000111_9" })
      .expect(400);
  });

  // ---------- templates ----------
  it("creates, updates, lists and deletes a post template", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/templates")
      .set(auth())
      .send({ name: "Dress template", kind: "post", body: "{name} only {price} THB", mediaIds: [] })
      .expect(201);
    const tid = created.body.id;
    await request(app.getHttpServer())
      .patch(`/api/templates/${tid}`)
      .set(auth())
      .send({ body: "SALE {price}" })
      .expect(200);
    const list = await request(app.getHttpServer()).get("/api/templates").set(auth()).expect(200);
    expect(list.body.some((t: { id: string }) => t.id === tid)).toBe(true);
    await request(app.getHttpServer()).delete(`/api/templates/${tid}`).set(auth()).expect(204);
  });

  // ---------- configurations ----------
  it("saves and reloads a configuration", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/configurations")
      .set(auth())
      .send({ name: "daily-drop", kind: "post", payload: { pageIds: [pageId], hour: 9 } })
      .expect(201);
    const got = await request(app.getHttpServer())
      .get(`/api/configurations/${res.body.id}`)
      .set(auth())
      .expect(200);
    expect(got.body.payload.pageIds).toEqual([pageId]);
  });

  // ---------- scheduled jobs ----------
  it("lists scheduled jobs for the workspace only", async () => {
    const res = await request(app.getHttpServer()).get("/api/scheduled-jobs").set(auth()).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((j: { queueJobId?: string | null }) => j.queueJobId !== null)).toBe(true);
  });
});
