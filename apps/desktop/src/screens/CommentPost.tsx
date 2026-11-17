import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Comment, FbComment, FbFeedPost, FbPostPhoto, MediaAsset } from "@scm/contracts";
import { api } from "../lib/api";
import { uploadFilesFast } from "../lib/bulk-upload";
import { submitCommentBatches } from "../lib/comment-batch";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

type Row = { body: string; mediaIds: string[]; uploadError: string | null };
const emptyRow: Row = { body: "", mediaIds: [], uploadError: null };
/** Key for the post-level comment row (fbPostId is the target itself). */
const POST_ROW = "__post__";

async function loadMedia(): Promise<{ items: MediaAsset[] }> {
  const items: MediaAsset[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 4; i++) {
    const page = await api.listMedia(cursor ? { cursor } : undefined);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { items };
}

/** Comment on an existing page post: pick page → pick post → per-photo comment rows. */
export default function CommentPost() {
  const pages = useQuery(() => api.listPages({ enabled: true }), []);
  const media = useQuery(loadMedia, []);

  const [pageId, setPageId] = useState("");
  const [feed, setFeed] = useState<FbFeedPost[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedErr, setFeedErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [post, setPost] = useState<FbFeedPost | null>(null);
  const [photos, setPhotos] = useState<FbPostPhoto[] | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [sent, setSent] = useState<Comment[]>([]);
  const [fbComments, setFbComments] = useState<Map<string, FbComment[]>>(new Map());

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [delay, setDelay] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<Record<string, MediaAsset>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTargetRef = useRef<string>(POST_ROW);
  const submitKeyRef = useRef<string | null>(null);
  const submitDraftRef = useRef<string | null>(null);

  const items = media.data?.items ?? [];
  const byId = new Map([...Object.entries(uploadedMedia), ...items.map((m) => [m.id, m] as const)]);

  useEffect(() => {
    const t = setInterval(() => {
      const pending = Object.values(rows).some((r) =>
        r.mediaIds.some((id) => !byId.get(id) || byId.get(id)?.status === "processing"),
      );
      if (pending) media.refetch();
    }, 1200);
    return () => clearInterval(t);
  });

  async function loadFeed(cursor?: string) {
    if (!pageId) return;
    setFeedLoading(true);
    setFeedErr(null);
    try {
      const res = await api.pageFeed(pageId, { limit: 25, ...(cursor ? { cursor } : {}) });
      setFeed((cur) => (cursor ? [...cur, ...res.items] : res.items));
      setFeedCursor(res.nextCursor);
    } catch (e) {
      setFeedErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFeedLoading(false);
    }
  }

  async function loadFbComments(fbPostId: string) {
    try {
      const res = await api.postComments(pageId, fbPostId);
      setFbComments(new Map(res.targets.map((t) => [t.fbTargetId, t.comments])));
    } catch { /* informational only */ }
  }

  async function loadSent(fbPostId: string) {
    try {
      const items: Comment[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const page = await api.listComments(cursor ? { cursor } : undefined);
        items.push(...page.items);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      setSent(items.filter((c) => c.fbPostId === fbPostId && c.socialPageId === pageId));
    } catch { /* sent list is informational only */ }
  }

  function selectPage(id: string) {
    setPageId(id);
    setFeed([]);
    setFeedCursor(null);
    setPost(null);
    setPhotos(null);
    setSent([]);
    setFbComments(new Map());
    setRows({});
    setCreated(null);
    submitKeyRef.current = null;
    submitDraftRef.current = null;
    setError(null);
    void (async () => {
      setFeedLoading(true);
      try {
        const res = await api.pageFeed(id, { limit: 25 });
        setFeed(res.items);
        setFeedCursor(res.nextCursor);
      } catch (e) {
        setFeedErr(e instanceof Error ? e.message : String(e));
      } finally {
        setFeedLoading(false);
      }
    })();
  }

  async function selectPost(p: FbFeedPost) {
    setPost(p);
    setPhotos(null);
    setRows({});
    setSent([]);
    setFbComments(new Map());
    setCreated(null);
    submitKeyRef.current = null;
    submitDraftRef.current = null;
    setError(null);
    setPhotosLoading(true);
    try {
      const res = await api.postPhotos(pageId, p.id);
      setPhotos(res.photos);
      void loadSent(p.id);
      void loadFbComments(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhotos([]);
    } finally {
      setPhotosLoading(false);
    }
  }

  async function upload(target: string, file: File) {
    setUploading(target);
    setError(null);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("รองรับเฉพาะ PNG, JPEG และ WebP");
      const ticket = await api.createUpload({
        fileName: file.name,
        mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
        sizeBytes: file.size,
      });
      const put = await globalThis.fetch(ticket.uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`S3 upload failed: HTTP ${put.status}`);
      const asset = await api.completeUpload(ticket.mediaId);
      setUploadedMedia((cur) => ({ ...cur, [asset.id]: asset }));
      setRows((cur) => ({ ...cur, [target]: { ...(cur[target] ?? emptyRow), mediaIds: [...(cur[target]?.mediaIds ?? []), ticket.mediaId], uploadError: null } }));
      media.refetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRows((cur) => ({ ...cur, [target]: { ...(cur[target] ?? emptyRow), uploadError: message } }));
    } finally {
      setUploading(null);
    }
  }

  async function uploadMany(files: File[], target: string) {
    if (files.length === 1) {
      await upload(target, files[0]!);
      return;
    }
    setQueue({ done: 0, total: files.length });
    setUploading(target);
    try {
      await uploadFilesFast(files.map((file) => ({ file, target })), {
        uploaded: ({ target: dest }, asset) => {
          setUploadedMedia((cur) => ({ ...cur, [asset.id]: asset }));
          setRows((cur) => ({ ...cur, [dest]: {
            ...(cur[dest] ?? emptyRow),
            mediaIds: [...(cur[dest]?.mediaIds ?? []), asset.id],
          } }));
        },
        failed: ({ target: dest }, message) => setRows((cur) => ({ ...cur, [dest]: {
          ...(cur[dest] ?? emptyRow), uploadError: message,
        } })),
        progress: (done, total) => setQueue({ done, total }),
      });
    } finally {
      setUploading(null);
      setQueue(null);
      media.refetch();
    }
  }

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((cur) => ({ ...cur, [key]: { ...(cur[key] ?? emptyRow), ...patch } }));

  const commentItems = [
    { key: POST_ROW, fbTargetId: post?.id ?? "", label: "ใต้โพสต์หลัก" },
    ...(photos ?? []).map((ph, i) => ({ key: ph.fbPhotoId, fbTargetId: ph.fbPhotoId, label: `ใต้รูป ${i + 1}` })),
  ];
  type BatchItem = { pageId: string; fbTargetId: string; fbPostId: string; mediaId?: string; body?: string };
  const comments: BatchItem[] = commentItems.flatMap(({ key, fbTargetId }): BatchItem[] => {
    const r = rows[key];
    if (!r || !fbTargetId || !post) return [];
    const body = r.body.trim();
    const base = { pageId, fbTargetId, fbPostId: post.id };
    if (!r.mediaIds.length) return body ? [{ ...base, body }] : [];
    return r.mediaIds.map((mediaId, i) => ({ ...base, mediaId, ...(i === 0 && body ? { body } : {}) }));
  });
  const pendingMedia = Object.values(rows)
    .flatMap((r) => r.mediaIds)
    .some((id) => byId.get(id)?.status !== "ready");
  const canSubmit = !!pageId && !!post && comments.length > 0 && uploading === null && !pendingMedia;

  async function submit() {
    const draft = JSON.stringify({ comments, delay });
    if (submitDraftRef.current && submitDraftRef.current !== draft) {
      setError("รายการเปลี่ยนหลังส่งบางส่วน กรุณาตรวจ History ก่อนเริ่มส่งชุดใหม่ เพื่อป้องกันคอมเมนต์ซ้ำ");
      return;
    }
    submitDraftRef.current = draft;
    submitKeyRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    let queued = 0;
    try {
      const total = await submitCommentBatches(comments, delay, submitKeyRef.current, (count) => {
        queued = count;
        setCreated(count);
      });
      setCreated(total);
      setRows({});
      submitKeyRef.current = null;
      submitDraftRef.current = null;
      if (post) void loadSent(post.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(queued ? `เข้าคิวแล้ว ${queued}/${comments.length} รายการ: ${message} — กดส่งอีกครั้งเพื่อทำรายการที่เหลือ (อย่าแก้ร่างระหว่างนี้)` : message);
    } finally {
      setBusy(false);
    }
  }

  const filteredFeed = search.trim()
    ? feed.filter((p) => (p.message ?? "").toLowerCase().includes(search.trim().toLowerCase()))
    : feed;

  return (
    <>
      <h2>คอมเมนต์โพสต์เก่า</h2>
      <Err msg={error} />
      {created !== null && (
        <div className="publish-result is-ok">
          <div className="pr-title">ส่งคอมเมนต์ {created} รายการเข้าคิวแล้ว</div>
          <div className="pr-note">ทยอยส่งทีละอันตาม delay {delay} วินาที — ดูผลได้ที่ <Link to="/history">History</Link></div>
        </div>
      )}

      <div className="card">
        <div className="sec-head">
          <span className="sec-num">1</span>
          <h3>เลือกเพจ</h3>
        </div>
        {!pages.data?.length ? (
          <p className="muted">No enabled pages — enable pages in Page Management first.</p>
        ) : (
          <div className="page-grid">
            {pages.data.map((p) => (
              <button key={p.id} type="button" className={`page-pick ${pageId === p.id ? "on" : ""}`} onClick={() => selectPage(p.id)}>
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" />
                ) : (
                  <span className="page-pick-ph">{p.name.slice(0, 1)}</span>
                )}
                <span className="page-pick-name">{p.name}</span>
                {pageId === p.id && <span className="page-pick-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {pageId && (
        <div className="card">
          <div className="sec-head">
            <span className="sec-num">2</span>
            <h3>เลือกโพสต์</h3>
            <input
              className="search-input"
              style={{ marginLeft: "auto", maxWidth: 260 }}
              placeholder="ค้นหาข้อความโพสต์…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Err msg={feedErr} />
          {feedLoading && !feed.length ? (
            <p className="muted">กำลังโหลดโพสต์…</p>
          ) : !filteredFeed.length ? (
            <p className="muted">{feed.length ? "ไม่พบโพสต์ที่ตรงคำค้น" : "ไม่มีโพสต์บนเพจนี้"}</p>
          ) : (
            <>
              <div className="feed-list">
                {filteredFeed.map((p) => (
                  <button key={p.id} type="button" className={`feed-item ${post?.id === p.id ? "on" : ""}`} onClick={() => selectPost(p)}>
                    {p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" />}
                    <span className="feed-msg">{p.message ?? "(ไม่มีข้อความ)"}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{fmtDate(p.createdTime)}</span>
                  </button>
                ))}
              </div>
              {feedCursor && !search.trim() && (
                <button className="link" disabled={feedLoading} onClick={() => void loadFeed(feedCursor)}>
                  {feedLoading ? "กำลังโหลด…" : "โหลดโพสต์เก่ากว่านี้"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {post && (
        <div className="card">
          <div className="sec-head">
            <span className="sec-num">3</span>
            <h3>คอมเมนต์ใต้โพสต์ / ใต้รูป</h3>
            <label className="delay-input" style={{ marginLeft: "auto" }}>
              delay
              <input type="number" min={0} max={3600} value={delay} onChange={(e) => setDelay(Math.max(0, Number(e.target.value) || 0))} />
              วินาที/คอมเมนต์
            </label>
          </div>
          <p className="muted">
            โพสต์: {post.message?.slice(0, 120) ?? "(ไม่มีข้อความ)"} · {fmtDate(post.createdTime)}
          </p>
          {photosLoading ? (
            <p className="muted">กำลังโหลดรูปในโพสต์…</p>
          ) : (
            <>
              {commentItems.map(({ key, fbTargetId, label }) => {
                const r = rows[key] ?? emptyRow;
                const photo = key === POST_ROW ? null : photos?.find((p) => p.fbPhotoId === key);
                return (
                  <div
                    key={key}
                    className={`product-detail-row ${dragOver === key ? "dragover" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.types.includes("Files")) setDragOver(key);
                    }}
                    onDragLeave={() => setDragOver((cur) => (cur === key ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length) void uploadMany(files, key);
                    }}
                  >
                    {photo?.imageUrl ? <img src={photo.imageUrl} alt={label} /> : <span className="post-row-badge">โพสต์</span>}
                    <label>
                      <span>คอมเมนต์{label}</span>
                      <textarea
                        rows={2}
                        maxLength={8000}
                        placeholder="ราคา / รายละเอียด / วิธีสั่งซื้อ (เว้นว่างหากไม่ต้องการคอมเมนต์ตรงนี้)"
                        value={r.body}
                        onChange={(e) => setRow(key, { body: e.target.value })}
                      />
                      <div className="detail-media-row">
                        {r.mediaIds.map((mid) => {
                          const cm = byId.get(mid);
                          return (
                            <div key={mid} className="media-cell on detail-thumb">
                              <img src={cm?.thumbnailUrl ?? cm?.url} alt="comment" />
                              {cm && cm.status !== "ready" && <StatusBadge status={cm.status} />}
                              <button className="media-del" style={{ opacity: 1 }} title="เอารูปออก" onClick={() => setRow(key, { mediaIds: r.mediaIds.filter((x) => x !== mid) })}>✕</button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className={`detail-attach ${uploading === key ? "is-uploading" : ""}`}
                          disabled={uploading !== null}
                          onClick={() => {
                            fileTargetRef.current = key;
                            fileRef.current?.click();
                          }}
                        >
                          {uploading === key ? (
                            <span className="up-loading"><span className="spin" />{queue && queue.total > 1 ? `อัปโหลด ${queue.done}/${queue.total}` : "กำลังอัปโหลด…"}</span>
                          ) : "+ รูปคอมเมนต์"}
                        </button>
                        {r.uploadError && <span className="muted" style={{ color: "#f87171" }}>{r.uploadError}</span>}
                      </div>
                      {(() => {
                        const target = key === POST_ROW ? post.id : key;
                        const sentHere = sent.filter((c) => c.fbTargetId === target);
                        return sentHere.length ? (
                          <div className="sent-strip">
                            <span className="muted">ส่งไปแล้ว {sentHere.length}:</span>
                            {sentHere.map((c) => {
                              const cm = c.mediaId ? byId.get(c.mediaId) : null;
                              return (
                                <span key={c.id} className="sent-chip" title={(c.body ?? "").slice(0, 200) || undefined}>
                                  {cm && <img src={cm.thumbnailUrl ?? cm.url} alt="" />}
                                  {!cm && <span className="sent-text">{(c.body ?? "").slice(0, 24) || "comment"}</span>}
                                  <StatusBadge status={c.status} />
                                </span>
                              );
                            })}
                          </div>
                        ) : null;
                      })()}
                      {(() => {
                        const target = key === POST_ROW ? post.id : key;
                        const fbHere = fbComments.get(target) ?? [];
                        if (!fbHere.length) return null;
                        const ourIds = new Set(
                          sent.filter((c) => c.fbTargetId === target && c.fbCommentId)
                            .flatMap((c) => { const s = c.fbCommentId!.split("_"); return [c.fbCommentId!, s[s.length - 1]!]; }),
                        );
                        const shown = fbHere.slice(0, 10);
                        return (
                          <div className="fb-cmt-list">
                            <span className="muted">คอมเมนต์เดิมบน Facebook ({fbHere.length}):</span>
                            {shown.map((fc) => {
                              const ours = ourIds.has(fc.id) || ourIds.has(fc.id.split("_").pop()!);
                              return (
                                <div key={fc.id} className="fb-cmt">
                                  {fc.imageUrl && <img src={fc.imageUrl} alt="" />}
                                  <span className="fb-cmt-name">{fc.fromName ?? "—"}</span>
                                  <span className="fb-cmt-msg">{(fc.message ?? "").slice(0, 80) || (fc.imageUrl ? "(รูป)" : "")}</span>
                                  {ours && <span className="badge ok">ผ่านแอป</span>}
                                </div>
                              );
                            })}
                            {fbHere.length > shown.length && <span className="muted">… และอีก {fbHere.length - shown.length} รายการ</span>}
                          </div>
                        );
                      })()}
                    </label>
                  </div>
                );
              })}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  const target = fileTargetRef.current;
                  e.target.value = "";
                  if (files.length) void uploadMany(files, target);
                }}
              />
            </>
          )}
        </div>
      )}

      {post && (
        <div className="publish-bar">
          <div className="summary">
            <strong>{pages.data?.find((p) => p.id === pageId)?.name ?? ""} · {photos?.length ?? 0} รูป · + {comments.length} คอมเมนต์</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {pendingMedia
                ? "รอประมวลผลรูปให้พร้อมก่อนส่ง"
                : uploading !== null
                  ? "กำลังอัปโหลดรูป…"
                  : comments.length === 0
                    ? "พิมพ์ข้อความหรือแนบรูปอย่างน้อย 1 คอมเมนต์"
                    : "ส่งทันที ทยอยตาม delay"}
            </div>
          </div>
          <div className="pb-actions">
            <button className="btn-primary" disabled={busy || !canSubmit} onClick={submit}>
              {busy ? "กำลังส่ง…" : "ส่งคอมเมนต์"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
