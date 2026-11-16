import { useState } from "react";
import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function Comments() {
  const pages = useQuery(() => api.listPages({ enabled: true }), []);
  const comments = useQuery(() => api.listComments(), []);
  const [pageId, setPageId] = useState("");
  const [fbTargetId, setFbTargetId] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.createComment({ pageId, fbTargetId, body, idempotencyKey: crypto.randomUUID() });
      setBody("");
      setFbTargetId("");
      comments.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Comment Manager</h2>
      <Err msg={error} />
      <div className="card">
        <h3>New comment</h3>
        <select value={pageId} onChange={(e) => setPageId(e.target.value)}>
          <option value="">— select page —</option>
          {pages.data?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input placeholder="Target FB post/comment ID (e.g. 123_456)" value={fbTargetId} onChange={(e) => setFbTargetId(e.target.value)} />
        <textarea rows={3} placeholder="Comment text…" value={body} onChange={(e) => setBody(e.target.value)} />
        <button disabled={busy || !pageId || !fbTargetId || !body} onClick={send}>
          {busy ? "…" : "Send comment"}
        </button>
      </div>
      <div className="card">
        <h3>Comment history</h3>
        {comments.loading ? (
          <p className="muted">Loading…</p>
        ) : !comments.data?.items.length ? (
          <p className="muted">No comments yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Target</th><th>Text</th><th>Status</th><th>Sent</th><th /></tr>
            </thead>
            <tbody>
              {comments.data.items.map((c) => (
                <tr key={c.id}>
                  <td className="mono muted">{c.fbTargetId}</td>
                  <td>{c.body ?? "(image)"}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="muted">{fmtDate(c.publishedAt ?? c.createdAt)}</td>
                  <td className="actions">
                    {c.status === "failed" && <button onClick={() => api.retryComment(c.id).then(comments.refetch)}>Retry</button>}
                    {(c.status === "queued" || c.status === "scheduled") && (
                      <button className="danger" onClick={() => api.cancelComment(c.id).then(comments.refetch)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
