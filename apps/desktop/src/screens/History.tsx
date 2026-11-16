import { useState } from "react";
import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function History() {
  const posts = useQuery(() => api.listPosts(), []);
  const comments = useQuery(() => api.listComments(), []);
  const media = useQuery(() => api.listMedia(), []);
  const notifications = useQuery(() => api.listNotifications(), []);
  const mediaById = new Map((media.data?.items ?? []).map((m) => [m.id, m]));
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <h2>History</h2>
      <Err msg={posts.error} />
      <div className="card">
        <h3>Posts</h3>
        {posts.loading ? (
          <p className="muted">Loading…</p>
        ) : !posts.data?.items.length ? (
          <p className="muted">No posts yet.</p>
        ) : (
          posts.data.items.map((p) => {
            const expanded = open === p.id;
            const postComments = (comments.data?.items ?? []).filter((c) =>
              p.pages.some((pg) => pg.fbPostId && c.fbTargetId === pg.fbPostId)
            );
            return (
              <div key={p.id} className="post-row">
                <div className="row-between">
                  <div>
                    <span className="badge">{p.kind}</span> <StatusBadge status={p.status} />{" "}
                    <span className="muted">{fmtDate(p.scheduledAt ?? p.createdAt)}</span>
                    <p>{p.body.slice(0, 140)}</p>
                    <p className="muted">
                      {p.mediaIds.length ? `${p.mediaIds.length} photo(s)` : "no photo"} · {postComments.length} comment(s) ·{" "}
                      {p.pages.length} page(s)
                    </p>
                  </div>
                  <div className="actions">
                    <button className="ghost" onClick={() => setOpen(expanded ? null : p.id)}>
                      {expanded ? "Hide detail" : "Detail"}
                    </button>
                    {p.status === "failed" || p.status === "partial" ? (
                      <button onClick={() => api.retryPost(p.id).then(posts.refetch)}>Retry failed</button>
                    ) : null}
                    {p.status === "queued" || p.status === "scheduled" ? (
                      <button className="danger" onClick={() => api.cancelPost(p.id).then(posts.refetch)}>Cancel</button>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="post-detail">
                    <div className="detail-block">
                      <h4>Post content</h4>
                      <pre className="detail-body">{p.body || "(empty)"}</pre>
                      {p.mediaIds.length ? (
                        <div className="detail-thumbs">
                          {p.mediaIds.map((id) => {
                            const m = mediaById.get(id);
                            return m ? (
                              <a key={id} href={m.url} target="_blank" rel="noreferrer">
                                <img src={m.thumbnailUrl ?? m.url} alt={m.name} className="detail-thumb" />
                              </a>
                            ) : (
                              <span key={id} className="detail-thumb detail-thumb-ph" />
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <table>
                      <tbody>
                        {p.pages.map((pg) => (
                          <tr key={pg.socialPageId}>
                            <td>{pg.pageName}</td>
                            <td><StatusBadge status={pg.status} /></td>
                            <td className="muted">attempts: {pg.attemptCount}</td>
                            <td className="muted mono">{pg.fbPostId ?? pg.lastError ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {postComments.length ? (
                      <div className="detail-block">
                        <h4>Comments under this post</h4>
                        <table>
                          <tbody>
                            {postComments.map((c) => (
                              <tr key={c.id}>
                                <td className="detail-body">{(c.body ?? "").slice(0, 120) || (c.mediaId ? "(image)" : "")}</td>
                                <td>
                                  {c.mediaId && mediaById.get(c.mediaId) ? (
                                    <a href={mediaById.get(c.mediaId)!.url} target="_blank" rel="noreferrer">
                                      <img
                                        src={mediaById.get(c.mediaId)!.thumbnailUrl ?? mediaById.get(c.mediaId)!.url}
                                        alt="comment"
                                        className="detail-thumb detail-thumb-sm"
                                      />
                                    </a>
                                  ) : null}
                                </td>
                                <td><StatusBadge status={c.status} /></td>
                                <td className="muted">{fmtDate(c.publishedAt ?? c.createdAt)}</td>
                                <td className="muted mono">{c.fbCommentId ?? c.lastError ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="card">
        <h3>Notifications</h3>
        {!notifications.data?.length ? (
          <p className="muted">None.</p>
        ) : (
          notifications.data.slice(0, 20).map((n) => (
            <p key={n.id} className="muted">
              {fmtDate(n.createdAt)} — {n.title}: {n.body}
            </p>
          ))
        )}
      </div>
    </>
  );
}
