import { describe, expect, it, vi } from "vitest";
import { submitCommentBatches } from "./comment-batch";

describe("large old-post comment batches", () => {
  it("submits all comments in bounded requests without resetting the delay or retry keys", async () => {
    const comments = Array.from({ length: 237 }, (_, i) => ({
      pageId: "page",
      fbTargetId: `photo-${i}`,
      body: `item-${i}`,
    }));
    const client = {
      createCommentBatch: vi.fn(async (input: { comments: unknown[] }) => ({ created: input.comments.length })),
    };
    const progress: number[] = [];
    const total = await submitCommentBatches(comments, 30, "batch-uuid", (queued) => progress.push(queued), client as never);
    expect(total).toBe(237);
    expect(progress).toEqual([100, 200, 237]);
    expect(client.createCommentBatch.mock.calls.map(([input]) => input.comments.length)).toEqual([100, 100, 37]);
    expect(client.createCommentBatch.mock.calls.map(([input]) => input)).toMatchObject([
      { startIndex: 0, staggerSeconds: 30, idempotencyKey: "batch-uuid-0" },
      { startIndex: 100, staggerSeconds: 30, idempotencyKey: "batch-uuid-100" },
      { startIndex: 200, staggerSeconds: 30, idempotencyKey: "batch-uuid-200" },
    ]);
  });
});
