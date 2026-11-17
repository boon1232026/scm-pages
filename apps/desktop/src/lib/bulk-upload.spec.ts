import { describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "@scm/contracts";
import { uploadFilesFast } from "./bulk-upload";

const asset = (id: string) => ({ id, status: "ready" } as MediaAsset);
const file = (name: string) => new File(["photo"], name, { type: "image/png" });

describe("bulk image upload", () => {
  it("sends eight images with one ticket and completion request, preserving their targets", async () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({ file: file(`${i}.png`), target: i }));
    const uploaded: number[] = [];
    const progress: number[] = [];
    const client = {
      createUploadsBatch: vi.fn(async () => ({
        tickets: entries.map((_, i) => ({ mediaId: `id-${i}`, uploadUrl: `https://storage.test/${i}` })),
      })),
      completeUploadsBatch: vi.fn(async () => ({
        results: entries.map((_, i) => ({ mediaId: `id-${i}`, asset: asset(`id-${i}`) })),
      })),
      completeUpload: vi.fn(),
    };
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    await uploadFilesFast(entries, {
      uploaded: ({ target }, media) => {
        expect(media.id).toBe(`id-${target}`);
        uploaded.push(target);
      },
      failed: () => { throw new Error("unexpected upload error"); },
      progress: (done) => progress.push(done),
    }, client as never, put as never);
    expect(client.createUploadsBatch).toHaveBeenCalledOnce();
    expect(client.completeUploadsBatch).toHaveBeenCalledOnce();
    expect(client.completeUpload).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(8);
    expect(uploaded).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(progress.at(-1)).toBe(8);
  });

  it("reports failed PUTs without completing or attaching their media", async () => {
    const entries = [{ file: file("ok.png"), target: 0 }, { file: file("bad.png"), target: 1 }];
    const uploaded: number[] = [];
    const failed: number[] = [];
    const client = {
      createUploadsBatch: vi.fn(async () => ({ tickets: [
        { mediaId: "ok", uploadUrl: "https://storage.test/ok" },
        { mediaId: "bad", uploadUrl: "https://storage.test/bad" },
      ] })),
      completeUploadsBatch: vi.fn(async () => ({ results: [{ mediaId: "ok", asset: asset("ok") }] })),
      completeUpload: vi.fn(),
    };
    await uploadFilesFast(entries, {
      uploaded: ({ target }) => uploaded.push(target),
      failed: ({ target }) => failed.push(target),
      progress: () => undefined,
    }, client as never, vi.fn(async (url: URL) =>
      new Response(null, { status: String(url).endsWith("/bad") ? 503 : 200 })) as never);
    expect(uploaded).toEqual([0]);
    expect(failed).toEqual([1]);
    expect(client.completeUploadsBatch).toHaveBeenCalledWith(["ok"]);
  });

  it("splits a large drop into bounded batches", async () => {
    const entries = Array.from({ length: 19 }, (_, i) => ({ file: file(`${i}.png`), target: i }));
    let ticket = 0;
    const client = {
      createUploadsBatch: vi.fn(async (files: File[]) => ({
        tickets: files.map(() => {
          const mediaId = String(ticket++);
          return { mediaId, uploadUrl: `https://storage.test/${mediaId}` };
        }),
      })),
      completeUploadsBatch: vi.fn(async (mediaIds: string[]) => ({
        results: mediaIds.map((mediaId) => ({ mediaId, asset: asset(mediaId) })),
      })),
      completeUpload: vi.fn(),
    };
    const uploaded: number[] = [];
    let active = 0;
    let peak = 0;
    await uploadFilesFast(entries, {
      uploaded: ({ target }) => uploaded.push(target),
      failed: () => { throw new Error("unexpected error"); },
      progress: () => undefined,
    }, client as never, vi.fn(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return new Response(null, { status: 200 });
    }) as never);
    expect(client.createUploadsBatch.mock.calls.map(([files]) => files.length)).toEqual([8, 8, 3]);
    expect(client.completeUploadsBatch).toHaveBeenCalledTimes(3);
    expect(uploaded).toEqual(entries.map((entry) => entry.target));
    expect(peak).toBe(6);
  });
});
