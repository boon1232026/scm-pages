import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * E2E: auth + workspace + RBAC against a real Postgres (scm_test).
 * Run: pnpm --filter @scm/api test:e2e
 */
describe("Auth & Workspaces (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const email = `u${Date.now()}@test.dev`;
  const password = "Str0ng!Pass";
  let accessToken = "";
  let refreshToken = "";
  let workspaceId = "";

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // clean up rows created by this run (cascades handle children)
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it("POST /api/auth/register creates user + workspace + tokens", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ email, password, displayName: "E2E User", workspaceName: "E2E Shop" })
      .expect(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.tokens.refreshToken).toBeTruthy();
    accessToken = res.body.tokens.accessToken;
    refreshToken = res.body.tokens.refreshToken;

    const member = await prisma.workspaceMember.findFirst({ where: { user: { email } } });
    expect(member?.role).toBe("owner");
    workspaceId = member!.workspaceId;
  });

  it("rejects duplicate registration", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ email, password, displayName: "Dup" })
      .expect(409);
  });

  it("POST /api/auth/login issues fresh tokens", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password })
      .expect(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
  });

  it("rejects wrong password", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: "wrong" })
      .expect(401);
  });

  it("GET /api/users/me requires auth and returns profile", async () => {
    await request(app.getHttpServer()).get("/api/users/me").expect(401);
    const res = await request(app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(email);
  });

  it("GET /api/workspaces lists membership; scoped endpoint enforces header", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/workspaces")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("E2E Shop");

    // foreign workspace id -> 403
    await request(app.getHttpServer())
      .get("/api/activity-logs")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-workspace-id", crypto.randomUUID())
      .expect(403);
  });

  it("refresh rotates the token and rejects reuse of the old one", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    // old token is revoked now
    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken })
      .expect(401);
    refreshToken = res.body.refreshToken;
  });

  it("logout revokes refresh token", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/logout")
      .send({ refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken })
      .expect(401);
  });

  it("RBAC: viewer cannot invite members, owner can", async () => {
    const argon2 = (await import("argon2")).default;
    const viewerPass = "ViewerPass123";
    const viewer = await prisma.user.create({
      data: {
        email: `v${Date.now()}@test.dev`,
        passwordHash: await argon2.hash(viewerPass),
        displayName: "V",
      },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: viewer.id, role: "viewer" },
    });
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: viewer.email, password: viewerPass })
      .expect(200);
    const viewerToken = login.body.tokens.accessToken;

    // viewer (rank 1) vs required admin (rank 3) -> 403
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ email: "someone@x.dev", role: "member" })
      .expect(403);

    // owner can invite (adds pending member record for unregistered email)
    const invite = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: `new${Date.now()}@x.dev`, role: "member" })
      .expect(201);
    expect(invite.body.invitationToken).toBeTruthy();

    await prisma.workspaceMember.deleteMany({ where: { userId: viewer.id } });
    await prisma.user.delete({ where: { id: viewer.id } });
  });
});
