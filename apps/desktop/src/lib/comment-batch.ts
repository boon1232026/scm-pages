import type { CreateCommentBatchInput } from "@scm/contracts";
import { api } from "./api";

const COMMENTS_PER_REQUEST = 100;

/** Bound each HTTP request without imposing a limit on the full comment set. */
export async function submitCommentBatches(
  comments: CreateCommentBatchInput["comments"],
  staggerSeconds: number,
  idempotencyKey: string,
  progress: (queued: number) => void,
  client: Pick<typeof api, "createCommentBatch"> = api,
) {
  let queued = 0;
  for (let start = 0; start < comments.length; start += COMMENTS_PER_REQUEST) {
    const { created } = await client.createCommentBatch({
      comments: comments.slice(start, start + COMMENTS_PER_REQUEST),
      staggerSeconds,
      startIndex: start,
      idempotencyKey: `${idempotencyKey}-${start}`,
    });
    queued += created;
    progress(queued);
  }
  return queued;
}
