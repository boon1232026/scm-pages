import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function History() {
  const posts = useQuery(() => api.listPosts(), []);
  const notifications = useQuery(() => api.listNotifications(), []);

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
          posts.data.items.map((p) => (
            <div key={p.id} className="post-row">
              <div className="row-between">
                <div>
                  <span className="badge">{p.kind}</span> <StatusBadge status={p.status} />{" "}
                  <span className="muted">{fmtDate(p.scheduledAt ?? p.createdAt)}</span>
                  <p>{p.body.slice(0, 140)}</p>
                </div>
                <div className="actions">
                  {p.status === "failed" || p.status === "partial" ? (
                    <button onClick={() => api.retryPost(p.id).then(posts.refetch)}>Retry failed</button>
                  ) : null}
                  {p.status === "queued" || p.status === "scheduled" ? (
                    <button className="danger" onClick={() => api.cancelPost(p.id).then(posts.refetch)}>Cancel</button>
                  ) : null}
                </div>
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
            </div>
          ))
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
