import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";
import type { Comment, FbFeedPost, FbPostPhoto, MediaAsset } from "@scm/contracts";

/** One old-post group: fetches post info + photos on expand to label each comment's target. */
function ExternalPostGroup({ fbPostId, comments, mediaById, pageName }: {
  fbPostId: string;
  comments: Comment[];
  mediaById: Map<string, MediaAsset>;
  pageName: string;
}) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ post: FbFeedPost; photos: FbPostPhoto[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.postPhotos(comments[0]!.socialPageId, fbPostId)
      .then(setInfo)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expand = () => setOpen((o) => !o);

  const photoIndex = new Map((info?.photos ?? []).map((p, i) => [p.fbPhotoId, i]));
  const targetLabel = (c: Comment) => {
    if (c.fbTargetId === fbPostId) return { label: "ใต้โพสต์", photo: null };
    const i = photoIndex.get(c.fbTargetId);
    return i !== undefined
      ? { label: `ใต้รูป ${i + 1}`, photo: info!.photos[i] }
      : { label: "ใต้รูป", photo: null };
  };
  const counts = comments.reduce<Record<string, number>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});

  return (
    <div className="post-row">
      <div className="hrow">
        {info?.post.thumbnailUrl ? (
          <img className="hrow-thumb" src={info.post.thumbnailUrl} alt="" />
        ) : (
          <div className="hrow-thumb hrow-thumb-ph">◫</div>
        )}
        <div className="hrow-body">
          <div className="hrow-title">{(info?.post.message ?? "").slice(0, 160) || "(โพสต์เก่า — ไม่มีข้อความ)"}</div>
          <div className="hrow-meta">
            <span className="badge">โพสต์เก่า</span>
            <span>{pageName}</span>
            <span>{comments.length} คอมเมนต์</span>
            {info?.post.createdTime && <span>{fmtDate(info.post.createdTime)}</span>}
            {info?.post.permalinkUrl && <a href={info.post.permalinkUrl} target="_blank" rel="noreferrer" className="link">เปิดโพสต์ ↗</a>}
          </div>
        </div>
        <div className="hrow-side">
          <div className="hrow-statuses">
            {Object.entries(counts).map(([s, n]) => (
              <span key={s} className="hrow-stat"><StatusBadge status={s} />{n}</span>
            ))}
          </div>
          <button className="ghost" onClick={expand}>{open ? "ซ่อน" : "รายละเอียด"}</button>
        </div>
      </div>
      {open && (
        <div className="post-detail">
          {loading && <p className="muted">กำลังโหลดข้อมูลโพสต์…</p>}
          <Err msg={err} />
          {info && (
            <table>
              <tbody>
                {comments.map((c) => {
                  const t = targetLabel(c);
                  return (
                    <tr key={c.id}>
                      <td className="muted">
                        {t.label}
                        {t.photo?.imageUrl && <img src={t.photo.imageUrl} alt="" className="detail-thumb detail-thumb-sm" />}
                      </td>
                      <td className="detail-body">{(c.body ?? "").slice(0, 120) || (c.mediaId ? "(image)" : "")}</td>
                      <td>
                        {c.mediaId && mediaById.get(c.mediaId) ? (
                          <a href={mediaById.get(c.mediaId)!.url} target="_blank" rel="noreferrer">
                            <img src={mediaById.get(c.mediaId)!.thumbnailUrl ?? mediaById.get(c.mediaId)!.url} alt="comment" className="detail-thumb detail-thumb-sm" />
                          </a>
                        ) : null}
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="muted">{fmtDate(c.publishedAt ?? c.createdAt)}</td>
                      <td className="muted mono">{(c.fbCommentId ?? c.lastError ?? "").slice(0, 44)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

async function loadPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>) {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const page = await fetchPage(cursor ?? undefined);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { items };
}

export default function History() {
  const posts = useQuery(() => api.listPosts(), []);
  const comments = useQuery(() => loadPages<Comment>((cursor) => api.listComments(cursor ? { cursor } : undefined)), []);
  const allPages = useQuery(() => api.listPages(), []);
  const media = useQuery(() => loadPages<MediaAsset>((cursor) => api.listMedia(cursor ? { cursor } : undefined)), []);
  const notifications = useQuery(() => api.listNotifications(), []);
  const mediaById = new Map((media.data?.items ?? []).map((m) => [m.id, m]));
  const [open, setOpen] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fText, setFText] = useState("");

  const pageNameById = new Map((allPages.data ?? []).map((pg) => [pg.id, pg.name]));
  const externalComments = (comments.data?.items ?? []).filter((c) => !c.postId);
  const extGroups = new Map<string, Comment[]>();
  for (const c of externalComments) {
    const key = c.fbPostId ?? c.fbTargetId;
    extGroups.set(key, [...(extGroups.get(key) ?? []), c]);
  }

  const items = (posts.data?.items ?? []).filter((p) => {
    if (fStatus !== "all" && p.status !== fStatus) return false;
    const day = (p.publishedAt ?? p.scheduledAt ?? p.createdAt).slice(0, 10);
    if (fFrom && day < fFrom) return false;
    if (fTo && day > fTo) return false;
    if (fText && !p.body.toLowerCase().includes(fText.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <h2>History</h2>
      <Err msg={posts.error} />
      <div className="card">
        <h3>Posts</h3>
        <div className="filter-bar">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">ทุกสถานะ</option>
            <option value="published">published</option>
            <option value="partial">partial</option>
            <option value="failed">failed</option>
            <option value="queued">queued</option>
            <option value="cancelled">cancelled</option>
          </select>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="จากวันที่" />
          <span className="muted">–</span>
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} title="ถึงวันที่" />
          <input type="search" placeholder="ค้นหาข้อความโพสต์…" value={fText} onChange={(e) => setFText(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          {(fStatus !== "all" || fFrom || fTo || fText) && (
            <button className="link" onClick={() => { setFStatus("all"); setFFrom(""); setFTo(""); setFText(""); }}>ล้าง</button>
          )}
        </div>
        {posts.loading ? (
          <p className="muted">Loading…</p>
        ) : !posts.data?.items.length ? (
          <p className="muted">No posts yet.</p>
        ) : !items.length ? (
          <p className="muted">ไม่มีรายการที่ตรงตัวกรอง</p>
        ) : (
          items.map((p) => {
            const expanded = open === p.id;
            const postComments = (comments.data?.items ?? []).filter((c) =>
              c.postId === p.id || p.pages.some((pg) => pg.fbPostId && c.fbTargetId === pg.fbPostId)
            );
            const commentTarget = (c: Comment) => {
              const page = p.pages.find((pg) => pg.socialPageId === c.socialPageId);
              const productId = Object.entries(page?.photoIds ?? {}).find(([, photoId]) => photoId === c.fbTargetId)?.[0];
              return {
                pageName: page?.pageName ?? "Page",
                productIndex: productId ? p.mediaIds.indexOf(productId) + 1 : null,
                product: productId ? mediaById.get(productId) : null,
              };
            };
            return (
              <div key={p.id} className="post-row">
                <div className="hrow">
                  {(() => {
                    const m = p.mediaIds.length ? mediaById.get(p.mediaIds[0]!) : null;
                    return m?.thumbnailUrl || m?.url ? (
                      <img className="hrow-thumb" src={m.thumbnailUrl ?? m.url} alt="" />
                    ) : (
                      <div className="hrow-thumb hrow-thumb-ph">✎</div>
                    );
                  })()}
                  <div className="hrow-body">
                    <div className="hrow-title">{p.body.slice(0, 160) || "(ไม่มีข้อความ)"}</div>
                    <div className="hrow-meta">
                      <span className="badge">{p.kind}</span>
                      <span>{fmtDate(p.scheduledAt ?? p.createdAt)}</span>
                      {p.mediaIds.length > 0 && <span>◫ {p.mediaIds.length} รูป</span>}
                      <span>✱ {postComments.length} คอมเมนต์</span>
                      <span>▦ {p.pages.length} เพจ</span>
                    </div>
                  </div>
                  <div className="hrow-side">
                    <StatusBadge status={p.status} />
                    <button className="ghost" onClick={() => setOpen(expanded ? null : p.id)}>
                      {expanded ? "ซ่อน" : "รายละเอียด"}
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
                      {p.firstComments.some((c) => c.targetMediaId) && (
                        <div className="detail-block">
                          <h4>รายละเอียดแยกตามรูปสินค้า</h4>
                          {p.firstComments.filter((c) => c.targetMediaId).map((c, i) => (
                            <p key={i} className="muted">
                              รูป {p.mediaIds.indexOf(c.targetMediaId!) + 1}: {c.body || "(รูปแนบคอมเมนต์)"}
                            </p>
                          ))}
                        </div>
                      )}
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
                    {p.pages.some((pg) => pg.photoIds && Object.keys(pg.photoIds).length > 0) && (
                      <div className="detail-block">
                        <h4>Facebook photo ID แยกตามเพจ</h4>
                        {p.pages.flatMap((pg) => Object.entries(pg.photoIds ?? {}).map(([id, photoId]) => (
                          <p key={`${pg.socialPageId}-${id}`} className="muted mono">
                            {pg.pageName} · รูป {p.mediaIds.indexOf(id) + 1}: {photoId}
                          </p>
                        )))}
                      </div>
                    )}
                    {postComments.length ? (
                      <div className="detail-block">
                        <h4>คอมเมนต์ของโพสต์และแต่ละรูปสินค้า</h4>
                        <table>
                          <tbody>
                            {postComments.map((c) => (
                              <tr key={c.id}>
                                <td className="muted">
                                  {commentTarget(c).pageName} · {commentTarget(c).productIndex
                                    ? `ใต้รูปสินค้า ${commentTarget(c).productIndex}`
                                    : "ใต้โพสต์"}
                                  {commentTarget(c).product && (
                                    <img src={commentTarget(c).product!.thumbnailUrl ?? commentTarget(c).product!.url} alt="product" className="detail-thumb detail-thumb-sm" />
                                  )}
                                </td>
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
      {extGroups.size ? (
        <div className="card">
          <h3>คอมเมนต์โพสต์เก่า</h3>
          {[...extGroups.entries()].map(([fbPostId, cs]) => (
            <ExternalPostGroup
              key={fbPostId}
              fbPostId={fbPostId}
              comments={cs}
              mediaById={mediaById}
              pageName={pageNameById.get(cs[0]!.socialPageId) ?? "Page"}
            />
          ))}
        </div>
      ) : null}
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
