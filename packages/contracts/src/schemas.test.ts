import { describe, expect, it } from "vitest";
import { createPostSchema, createCommentSchema, registerSchema } from "./schemas.js";
import { PostKind } from "./enums.js";

const uuid = () => crypto.randomUUID();

describe("createPostSchema", () => {
  it("accepts a text post to multiple pages", () => {
    const r = createPostSchema.safeParse({
      kind: PostKind.Text,
      body: "สวัสดี",
      pageIds: [uuid(), uuid()],
    });
    expect(r.success).toBe(true);
  });

  it("rejects text post with media and photo post without media", () => {
    const media = uuid();
    expect(
      createPostSchema.safeParse({ kind: PostKind.Text, body: "x", pageIds: [uuid()], mediaIds: [media] }).success,
    ).toBe(false);
    expect(
      createPostSchema.safeParse({ kind: PostKind.Photo, body: "x", pageIds: [uuid()] }).success,
    ).toBe(false);
  });

  it("enforces single media for photo kind", () => {
    expect(
      createPostSchema.safeParse({
        kind: PostKind.Photo, body: "x", pageIds: [uuid()], mediaIds: [uuid(), uuid()],
      }).success,
    ).toBe(false);
  });

  it("rejects empty pageIds", () => {
    expect(createPostSchema.safeParse({ kind: PostKind.Text, body: "x", pageIds: [] }).success).toBe(false);
  });
});

describe("createCommentSchema", () => {
  it("requires body or mediaId", () => {
    expect(
      createCommentSchema.safeParse({ pageId: uuid(), fbTargetId: "1_2" }).success,
    ).toBe(false);
    expect(
      createCommentSchema.safeParse({ pageId: uuid(), fbTargetId: "1_2", body: "hi" }).success,
    ).toBe(true);
    expect(
      createCommentSchema.safeParse({ pageId: uuid(), fbTargetId: "1_2", mediaId: uuid() }).success,
    ).toBe(true);
  });
});

describe("registerSchema", () => {
  it("rejects weak passwords", () => {
    expect(
      registerSchema.safeParse({ email: "a@b.co", password: "short", displayName: "A" }).success,
    ).toBe(false);
  });
});
