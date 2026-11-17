import { describe, expect, it, vi } from "vitest";
import { MediaService } from "./media.service";

describe("batch media completion", () => {
  it("keeps successful uploads when another file is absent, without changing the workspace", async () => {
    const service = new MediaService({} as never, {} as never, {} as never);
    const complete = vi.spyOn(service, "complete").mockImplementation(async (workspaceId, id) => {
      if (workspaceId !== "my-workspace") throw new Error("wrong workspace");
      if (id === "missing") throw new Error("file not in storage");
      return { id, status: "ready" } as never;
    });
    const { results } = await service.completeUploadsBatch("my-workspace", ["ok", "missing"]);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ mediaId: "ok", asset: { status: "ready" } });
    expect(results[1]).toMatchObject({ mediaId: "missing", error: "file not in storage" });
    expect(results[1]).not.toHaveProperty("asset");
  });
});
