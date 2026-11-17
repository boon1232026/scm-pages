import { describe, expect, it, vi } from "vitest";
import { CommentsService } from "./comments.service";

describe("old-post batch scheduling", () => {
  it("keeps staggered times across request boundaries", async () => {
    const service = new CommentsService({} as never, {} as never, {} as never, {} as never);
    const create = vi.spyOn(service, "create").mockResolvedValue({} as never);
    const now = Date.now();
    const comments = Array.from({ length: 3 }, () => ({ pageId: "page", fbTargetId: "photo", body: "test" }));
    await service.createBatch("workspace", "user", {
      comments,
      startIndex: 100,
      staggerSeconds: 30,
      idempotencyKey: "batch-uuid-100",
    });
    const inputs = create.mock.calls.map(([, , input]) => input);
    expect(inputs.map((item) => item.idempotencyKey)).toEqual([
      "batch-uuid-100-0", "batch-uuid-100-1", "batch-uuid-100-2",
    ]);
    expect(new Date(inputs[0]!.scheduledAt!).getTime()).toBeGreaterThanOrEqual(now + 100 * 30_000);
    expect(new Date(inputs[1]!.scheduledAt!).getTime() - new Date(inputs[0]!.scheduledAt!).getTime()).toBe(30_000);
    expect(new Date(inputs[2]!.scheduledAt!).getTime() - new Date(inputs[1]!.scheduledAt!).getTime()).toBe(30_000);
  });
});
