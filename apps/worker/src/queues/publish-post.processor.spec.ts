import { describe, expect, it, vi } from "vitest";
import { createPostSchema } from "@scm/contracts";
import { PublishPostProcessor } from "./publish-post.processor";

const productA = "11111111-1111-4111-8111-111111111111";
const productB = "22222222-2222-4222-8222-222222222222";
const pageA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pageB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("photo-specific comments", () => {
  it("rejects a target photo not attached to the post", () => {
    const input = {
      kind: "multi_photo", body: "products", pageIds: [pageA], mediaIds: [productA, productB],
      firstComments: [{ body: "wrong item", targetMediaId: crypto.randomUUID() }],
    };
    expect(createPostSchema.safeParse(input).success).toBe(false);
    expect(createPostSchema.safeParse({ ...input, firstComments: [{ body: "item A", targetMediaId: productA }] }).success).toBe(true);
  });

  it("targets the correct Facebook photo on each page, not the parent post or another product", async () => {
    const created: Array<{ socialPageId: string; fbTargetId: string; body: string | null }> = [];
    const postPages = [pageA, pageB].map((page, index) => ({
      id: `post-page-${index}`, postId: "post-1", socialPageId: page,
      status: "queued", fbPostId: null, photoIds: null,
      socialPage: { pageId: `fb-page-${index}`, name: `Page ${index}` },
      post: {
        workspaceId: "workspace-1", createdBy: "user-1", body: "products", kind: "multi_photo",
        linkUrl: null, firstComments: [
          { body: "product A", targetMediaId: productA },
          { body: "product B", targetMediaId: productB },
        ],
        commentDelaySec: 0,
        media: [
          { mediaAssetId: productA, mediaAsset: { url: "https://cdn.test/a.png" } },
          { mediaAssetId: productB, mediaAsset: { url: "https://cdn.test/b.png" } },
        ],
      },
    }));
    const prisma = {
      postPage: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => postPages.find((pp) => pp.id === where.id)),
        findMany: vi.fn(async () => [{ status: "published" }]),
        update: vi.fn(async () => ({})),
      },
      post: { update: vi.fn(async () => ({})) },
      socialPage: { update: vi.fn(async () => ({})) },
      socialToken: { findFirst: vi.fn(async () => ({ tokenEncrypted: "encrypted" })) },
      comment: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: { socialPageId: string; fbTargetId: string; body: string | null } }) => {
          created.push(data);
          return { id: `comment-${created.length}` };
        }),
      },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    const meta = {
      uploadPhoto: vi.fn(async (page: string, _token: string, url: string) => ({
        id: `${page}-${url.endsWith("a.png") ? "a" : "b"}`,
      })),
      createFeedPost: vi.fn(async (page: string) => ({ id: `${page}-post` })),
    };
    const recorder = {
      attemptStart: vi.fn(async () => ({ job: null, attemptNo: 1 })),
      attemptSuccess: vi.fn(async () => undefined),
      attemptFailure: vi.fn(async () => undefined),
    };
    const queue = { add: vi.fn(async () => ({})) };
    const processor = new PublishPostProcessor(
      prisma as never, recorder as never, meta as never,
      { decrypt: () => "token" } as never, queue as never,
    );
    for (const pp of postPages) {
      await processor.process({ id: pp.id, data: { postPageId: pp.id, postId: pp.postId, workspaceId: "workspace-1" } } as never);
    }
    expect(created.map((c) => [c.socialPageId, c.body, c.fbTargetId])).toEqual([
      [pageA, "product A", "fb-page-0-a"],
      [pageA, "product B", "fb-page-0-b"],
      [pageB, "product A", "fb-page-1-a"],
      [pageB, "product B", "fb-page-1-b"],
    ]);
    expect(prisma.postPage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ photoIds: { [productA]: "fb-page-0-a", [productB]: "fb-page-0-b" } }),
    }));
    expect(queue.add).toHaveBeenCalledTimes(4);
  });
});
