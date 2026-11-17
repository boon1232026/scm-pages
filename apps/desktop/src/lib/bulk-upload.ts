import type { CreateUploadInput, MediaAsset } from "@scm/contracts";
import { api } from "./api";

const BATCH_SIZE = 8;
const PUT_CONCURRENCY = 6;
const MAX_SIZE = 10 * 1024 * 1024;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type Entry<T> = { file: File; target: T };
type UploadClient = Pick<typeof api, "createUploadsBatch" | "completeUploadsBatch" | "completeUpload">;

/** One ticket request and one completion request per batch; file bytes still go directly to S3. */
export async function uploadFilesFast<T>(
  entries: Entry<T>[],
  callbacks: {
    uploaded: (entry: Entry<T>, asset: MediaAsset) => void;
    failed: (entry: Entry<T>, message: string) => void;
    progress: (done: number, total: number) => void;
  },
  client: UploadClient = api,
  put: typeof fetch = fetch.bind(globalThis),
) {
  let done = 0;
  const success = (entry: Entry<T>, asset: MediaAsset) => {
    callbacks.uploaded(entry, asset);
    callbacks.progress(++done, entries.length);
  };
  const failure = (entry: Entry<T>, e: unknown) => {
    callbacks.failed(entry, e instanceof Error ? e.message : String(e));
    callbacks.progress(++done, entries.length);
  };

  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const chunk = entries.slice(start, start + BATCH_SIZE);
    const valid: { entry: Entry<T>; input: CreateUploadInput }[] = [];
    for (const entry of chunk) {
      const { file } = entry;
      if (!MIME_TYPES.some((type) => type === file.type)) {
        failure(entry, new Error("รองรับเฉพาะ PNG, JPEG และ WebP"));
      } else if (!file.size || file.size > MAX_SIZE) {
        failure(entry, new Error("รูปต้องมีขนาดไม่เกิน 10 MB"));
      } else {
        valid.push({ entry, input: {
          fileName: file.name,
          mimeType: file.type as CreateUploadInput["mimeType"],
          sizeBytes: file.size,
        } });
      }
    }
    if (!valid.length) continue;

    try {
      const { tickets } = await client.createUploadsBatch(valid.map((v) => v.input));
      if (tickets.length !== valid.length) throw new Error("จำนวน upload tickets ไม่ตรงกับไฟล์");
      const puts: unknown[] = [];
      for (let offset = 0; offset < valid.length; offset += PUT_CONCURRENCY) {
        puts.push(...await Promise.all(valid.slice(offset, offset + PUT_CONCURRENCY).map(async ({ entry }, i) => {
          try {
            const res = await put(tickets[offset + i]!.uploadUrl, { method: "PUT", body: entry.file });
            if (!res.ok) throw new Error(`S3 upload failed: HTTP ${res.status}`);
            return null;
          } catch (e) {
            return e;
          }
        })));
      }
      const completed = valid.flatMap((v, i) => puts[i] === null ? [{ ...v, mediaId: tickets[i]!.mediaId }] : []);
      valid.forEach((v, i) => {
        if (puts[i] !== null) failure(v.entry, puts[i]);
      });
      if (!completed.length) continue;

      try {
        const response = await client.completeUploadsBatch(completed.map((v) => v.mediaId));
        const byId = new Map(response.results.map((result) => [result.mediaId, result]));
        for (const { entry, mediaId } of completed) {
          const result = byId.get(mediaId);
          if (result?.asset) success(entry, result.asset);
          else failure(entry, new Error(result?.error ?? "Upload completion missing"));
        }
      } catch {
        // A lost batch response must not discard uploaded files; completion is safe to retry.
        await Promise.all(completed.map(async ({ entry, mediaId }) => {
          try {
            success(entry, await client.completeUpload(mediaId));
          } catch (e) {
            failure(entry, e);
          }
        }));
      }
    } catch (e) {
      valid.forEach(({ entry }) => failure(entry, e));
    }
  }
}
