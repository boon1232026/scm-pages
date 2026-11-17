import { useEffect, useRef, useState } from "react";
import type { MediaAsset, Post } from "@scm/contracts";
import { api } from "../lib/api";
import { uploadFilesFast } from "../lib/bulk-upload";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

/** Single workspace: compose post + first-comment in one pass, publish to all selected pages. */
type DraftComment = {
  id: string;
  body: string;
  mediaId: string | null;
  targetMediaId: string | null;
  fileName?: string | undefined;
  uploadState?: "uploading" | "failed" | undefined;
  uploadError?: string | undefined;
};

type ProductDetail = { body: string; mediaIds: string[]; uploadError: string | null };
const emptyDetail: ProductDetail = { body: "", mediaIds: [], uploadError: null };

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

const newComment = (targetMediaId: string | null = null): DraftComment => ({
  id: crypto.randomUUID(), body: "", mediaId: null, targetMediaId,
});

export default function Compose() {
  const pages = useQuery(() => api.listPages({ enabled: true }), []);
  const media = useQuery(loadMedia, []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);

  const [useFirstComment, setUseFirstComment] = useState(false);
  const [commentDelay, setCommentDelay] = useState(30);
  const [draftComments, setDraftComments] = useState<DraftComment[]>([]);
  const [productDetails, setProductDetails] = useState<Record<string, ProductDetail>>({});
  const [batchActive, setBatchActive] = useState(false);
  const [postDragOver, setPostDragOver] = useState(false);
  const [detailDragOver, setDetailDragOver] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const [trackPost, setTrackPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"post" | string | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<Record<string, MediaAsset>>({});
  const [showPostLib, setShowPostLib] = useState(false);
  const [showCommentLib, setShowCommentLib] = useState<string | null>(null);
  const postFileRef = useRef<HTMLInputElement>(null);
  const batchFileRef = useRef<HTMLInputElement>(null);
  const detailImageRef = useRef<HTMLInputElement>(null);
  const detailTargetRef = useRef<string>("");
  const commentFileRefs = useRef<Record<string, HTMLInputElement | null>>({});


  const readyMedia = (media.data?.items ?? []).filter((m) => m.status === "ready");
  const kind = mediaIds.length === 0 ? "text" : mediaIds.length === 1 ? "photo" : "multi_photo";

  function toggle(set: Set<string>, id: string) {
    const s = new Set(set);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    return s;
  }

  const items = media.data?.items ?? [];
  const byId = new Map([...Object.entries(uploadedMedia), ...items.map((m) => [m.id, m] as const)]);
  const attachedPost = mediaIds.map((id) => byId.get(id)).filter((m) => !!m);

  useEffect(() => {
    const t = setInterval(() => {
      if (mediaIds.some((id) => !byId.get(id) || byId.get(id)?.status === "processing") ||
        draftComments.some((c) => c.mediaId && (!byId.get(c.mediaId) || byId.get(c.mediaId)?.status === "processing"))) {
        media.refetch();
      }
    }, 1200);
    return () => clearInterval(t);
  });

  async function upload(file: File, target: "post" | string) {
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
      if (target === "post") setMediaIds((cur) => [...cur, ticket.mediaId]);
      else if (target.startsWith("detail:")) {
        const id = target.slice(7);
        setProductDetails((cur) => ({ ...cur, [id]: { ...(cur[id] ?? emptyDetail), mediaIds: [...(cur[id]?.mediaIds ?? []), ticket.mediaId], uploadError: null } }));
      } else setDraftComments((cur) => cur.map((c) => (c.id === target ? { ...c, mediaId: ticket.mediaId, uploadState: undefined, uploadError: undefined } : c)));
      media.refetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (target === "post") setError(message);
      else if (target.startsWith("detail:")) {
        const id = target.slice(7);
        setProductDetails((cur) => ({ ...cur, [id]: { ...(cur[id] ?? emptyDetail), uploadError: message } }));
      } else setDraftComments((cur) => cur.map((c) => c.id === target ? { ...c, uploadState: "failed", uploadError: message } : c));
    } finally {
      setUploading(null);
    }
  }

  async function uploadMany(files: File[], target: "post" | string) {
    if (files.length === 1) {
      await upload(files[0]!, target);
      return;
    }
    setQueue({ done: 0, total: files.length });
    setUploading(target);
    try {
      await uploadFilesFast(files.map((file) => ({ file, target })), {
        uploaded: ({ target: dest }, asset) => {
          setUploadedMedia((cur) => ({ ...cur, [asset.id]: asset }));
          if (dest === "post") setMediaIds((cur) => [...cur, asset.id]);
          else if (dest.startsWith("detail:")) {
            const id = dest.slice(7);
            setProductDetails((cur) => ({ ...cur, [id]: {
              ...(cur[id] ?? emptyDetail),
              mediaIds: [...(cur[id]?.mediaIds ?? []), asset.id],
            } }));
          } else setDraftComments((cur) => cur.map((c) => c.id === dest
            ? { ...c, mediaId: asset.id, uploadState: undefined, uploadError: undefined } : c));
        },
        failed: ({ target: dest }, message) => {
          if (dest === "post") setError(message);
          else if (dest.startsWith("detail:")) {
            const id = dest.slice(7);
            setProductDetails((cur) => ({ ...cur, [id]: { ...(cur[id] ?? emptyDetail), uploadError: message } }));
          } else setDraftComments((cur) => cur.map((c) => c.id === dest
            ? { ...c, uploadState: "failed", uploadError: message } : c));
        },
        progress: (done, total) => setQueue({ done, total }),
      });
    } finally {
      setUploading(null);
      setQueue(null);
      media.refetch();
    }
  }

  async function uploadBatch(files: File[]) {
    if (!files.length || batchActive) return;
    const rows = files.map((f) => ({ ...newComment(mediaIds.length === 1 ? mediaIds[0]! : null), fileName: f.name, uploadState: "uploading" as const }));
    setDraftComments((cur) => [...cur, ...rows]);
    setUseFirstComment(true);
    setBatchActive(true);
    try {
      await uploadFilesFast(files.map((file, i) => ({ file, target: rows[i]!.id })), {
        uploaded: ({ target }, asset) => {
          setUploadedMedia((cur) => ({ ...cur, [asset.id]: asset }));
          setDraftComments((cur) => cur.map((c) => c.id === target
            ? { ...c, mediaId: asset.id, uploadState: undefined, uploadError: undefined } : c));
        },
        failed: ({ target }, message) => setDraftComments((cur) => cur.map((c) => c.id === target
          ? { ...c, uploadState: "failed", uploadError: message } : c)),
        progress: () => undefined,
      });
    } finally {
      setBatchActive(false);
      media.refetch();
    }
  }

  const setDetail = (id: string, patch: Partial<ProductDetail>) =>
    setProductDetails((cur) => ({ ...cur, [id]: { ...(cur[id] ?? emptyDetail), ...patch } }));

  const detailComments = mediaIds.flatMap((id): { body?: string; mediaId?: string; targetMediaId: string }[] => {
    const d = productDetails[id];
    if (!d) return [];
    const body = d.body.trim();
    if (!d.mediaIds.length) return body ? [{ body, targetMediaId: id }] : [];
    return d.mediaIds.map((mediaId, i) => (i === 0 && body ? { mediaId, targetMediaId: id, body } : { mediaId, targetMediaId: id }));
  });
  const activeComments = draftComments.filter((c) => c.body.trim() || c.mediaId);
  const pendingMedia = [...mediaIds, ...activeComments.map((c) => c.mediaId), ...Object.values(productDetails).flatMap((d) => d.mediaIds)]
    .filter((id): id is string => !!id)
    .some((id) => byId.get(id)?.status !== "ready");
  const commentCount = detailComments.length + (useFirstComment ? activeComments.length : 0);

  async function publish() {
    setBusy(true);
    setError(null);
    setTrackPost(null);
    try {
      if (detailComments.length || (useFirstComment && activeComments.some((c) => c.targetMediaId))) {
        let supported = false;
        try {
          supported = (await api.postCapabilities()).photoComments === true;
        } catch {
          // Older backends silently discard targetMediaId; never publish to the parent post instead.
        }
        if (!supported) throw new Error("เซิร์ฟเวอร์ยังไม่รองรับคอมเมนต์ใต้รูปสินค้า กรุณารออัปเดตระบบก่อนเผยแพร่");
      }
      const post = await api.createPost({
        kind,
        body,
        pageIds: [...selected],
        mediaIds,

        ...(commentCount
          ? {
              firstComments: [
                ...detailComments,
                ...(useFirstComment ? activeComments.map((c) => ({
                  ...(c.body.trim() ? { body: c.body.trim() } : {}),
                  ...(c.mediaId ? { mediaId: c.mediaId } : {}),
                  ...(c.targetMediaId ? { targetMediaId: c.targetMediaId } : {}),
                })) : []),
              ],
              commentDelaySeconds: commentDelay,
            }
          : {}),
        timezone: "Asia/Bangkok",
        idempotencyKey: crypto.randomUUID(),
      });
      setTrackPost(post);
      setBody("");
      setMediaIds([]);
      setDraftComments([]);
      setProductDetails({});
      setUseFirstComment(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canPublish =
    !!selected.size &&
    (kind === "text" ? !!body.trim() : mediaIds.length > 0) &&
    !batchActive && uploading === null && !pendingMedia &&
    !draftComments.some((c) => c.uploadState) &&
    (!useFirstComment || commentCount > 0);

  const summary = [
    `${selected.size} page(s)`,
    mediaIds.length ? `${mediaIds.length} photo(s)` : "text",
    commentCount ? `+ ${commentCount} comment(s)` : null,
    "now",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <h2>Compose</h2>
      <Err msg={error} />
      {trackPost &&
        (() => {
          const done = trackPost.pages.every((pg) => ["published", "failed", "skipped", "cancelled"].includes(pg.status));
          const fails = trackPost.pages.filter((pg) => pg.status === "failed");
          const cls = !done ? "is-run" : fails.length ? "is-fail" : "is-ok";
          const title = !done
            ? "กำลังส่งไปยัง Facebook…"
            : fails.length === 0
              ? "โพสต์สำเร็จแล้ว!"
              : fails.length === trackPost.pages.length
                ? "ส่งไม่สำเร็จ — ทุกเพจล้มเหลว"
                : "สำเร็จบางเพจ — มีเพจที่ล้มเหลว";
          return (
            <div className={`publish-result ${cls}`}>
              <div className="pr-title">{title}</div>
              {trackPost.pages.map((pg) => (
                <div key={pg.socialPageId} className="pr-row">
                  <span className="pr-page">{pg.pageName}</span>
                  <StatusBadge status={pg.status} />
                  <span className="muted mono pr-msg">
                    {pg.fbPostId ??
                      (pg.lastError ? (typeof pg.lastError === "string" ? pg.lastError : JSON.stringify(pg.lastError)) : "")}
                  </span>
                </div>
              ))}
              {done && fails.length === 0 && trackPost.firstComments.length > 0 && (
                <div className="pr-note">
                  คอมเมนต์ {trackPost.firstComments.length} อันกำลังตามมาทีละอันตาม delay {trackPost.commentDelaySec ?? 0} วินาที — ดูผลได้ที่ History
                </div>
              )}
            </div>
          );
        })()}

      <div className="compose-grid">
        {/* ---------- left: the form ---------- */}
        <div>
          <div className="card">
            <div className="sec-head">
              <span className="sec-num">1</span>
              <h3>เลือกเพจ</h3>
              <button
                className="link"
                style={{ marginLeft: "auto" }}
                onClick={() =>
                  setSelected((s) =>
                    s.size === (pages.data?.length ?? 0) ? new Set() : new Set(pages.data?.map((p) => p.id)),
                  )
                }
              >
                {selected.size === (pages.data?.length ?? 0) && pages.data?.length ? "Clear all" : "Select all"}
              </button>
            </div>
            {!pages.data?.length ? (
              <p className="muted">No enabled pages — enable pages in Page Management first.</p>
            ) : (
              <div className="page-grid">
                {pages.data.map((p) => (
                  <button key={p.id} type="button" className={`page-pick ${selected.has(p.id) ? "on" : ""}`} onClick={() => setSelected((s) => toggle(s, p.id))}>
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" />
                    ) : (
                      <span className="page-pick-ph">{p.name.slice(0, 1)}</span>
                    )}
                    <span className="page-pick-name">{p.name}</span>
                    <StatusBadge status={p.tokenStatus} />
                    {selected.has(p.id) && <span className="page-pick-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="sec-head">
              <span className="sec-num">2</span>
              <h3>เนื้อโพสต์</h3>
              <span className="hint">{kind}</span>
            </div>
            <textarea rows={6} placeholder="พิมพ์ข้อความโพสต์…" value={body} onChange={(e) => setBody(e.target.value)} />


            <div
              className={`post-drop ${postDragOver ? "dragover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setPostDragOver(true); }}
              onDragLeave={() => setPostDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setPostDragOver(false);
                const files = Array.from(e.dataTransfer.files).slice(0, Math.max(0, 10 - mediaIds.length));
                if (files.length) void uploadMany(files, "post");
              }}
            >
            <span className="field-label">รูปภาพของโพสต์ — {mediaIds.length} attached · ลากรูปมาวางตรงนี้ได้เลย</span>
            <div className="media-grid">
              <button type="button" className={`media-cell upload ${uploading === "post" ? "is-uploading" : ""}`} disabled={uploading !== null || mediaIds.length >= 10} onClick={() => postFileRef.current?.click()}>
                {uploading === "post" ? (
                  <span className="up-loading"><span className="spin" />{queue && queue.total > 1 ? `อัปโหลด ${queue.done}/${queue.total}` : "กำลังอัปโหลด…"}</span>
                ) : (<><span className="up-icon">+</span>Upload</>)}
              </button>
              <input ref={postFileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => {
                const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, 10 - mediaIds.length));
                e.target.value = "";
                if (files.length) void uploadMany(files, "post");
              }} />
              {attachedPost.map((m) => (
                <div key={m.id} className="media-cell on">
                  <button className="media-del" style={{ opacity: 1 }} title="เอารูปออกจากโพสต์" onClick={() => {
                    setMediaIds((cur) => cur.filter((x) => x !== m.id));
                    setProductDetails((cur) => { const next = { ...cur }; delete next[m.id]; return next; });
                    setDraftComments((cur) => cur.map((c) => c.targetMediaId === m.id ? { ...c, targetMediaId: null } : c));
                  }}>✕</button>
                  <img src={m.thumbnailUrl ?? m.url} alt={m.name} />
                  <span title={m.name}>{m.name}</span>
                  {m.status !== "ready" && <StatusBadge status={m.status} />}
                </div>
              ))}
            </div>
            <button className="link" style={{ marginTop: 8 }} onClick={() => setShowPostLib((v) => !v)}>
              {showPostLib ? "▾ ซ่อนคลังรูป" : "▸ เลือกรูปจากคลังเดิม"}
            </button>
            {showPostLib && (
              <div className="media-grid" style={{ marginTop: 8 }}>
                {readyMedia.filter((m) => !mediaIds.includes(m.id)).map((m) => (
                  <button key={m.id} type="button" disabled={mediaIds.length >= 10} className="media-cell" onClick={() => setMediaIds((cur) => [...cur, m.id])}>
                    <img src={m.thumbnailUrl ?? m.url} alt={m.name} />
                    <span title={m.name}>{m.name}</span>
                  </button>
                ))}
                {!readyMedia.filter((m) => !mediaIds.includes(m.id)).length && <p className="muted">คลังว่าง — upload รูปใหม่ด้านบน</p>}
              </div>
            )}
            </div>
            {mediaIds.length > 0 && (
              <div className="product-details">
                <div className="sec-head" style={{ marginBottom: 2 }}>
                  <h4 style={{ margin: 0 }}>รายละเอียดสินค้าใต้รูปบน Facebook</h4>
                  <label className="delay-input" style={{ marginLeft: "auto" }}>
                    delay
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={commentDelay}
                      onChange={(e) => setCommentDelay(Math.max(0, Number(e.target.value) || 0))}
                    />
                    วินาที/คอมเมนต์
                  </label>
                </div>
                <p className="muted">ข้อความและรูปในแต่ละแถวจะเป็นคอมเมนต์ใต้รูปสินค้านั้นโดยตรง — ลากรูปมาวางที่แถวหรือกด + รูปคอมเมนต์ ได้หลายรูปต่อแถว · คอมเมนต์ทั้งหมดจะทยอยส่งทีละอันตาม delay กันโดนสแปม</p>
                {mediaIds.map((id, i) => {
                  const m = byId.get(id);
                  const detail = productDetails[id] ?? emptyDetail;
                  return (
                    <div
                      key={id}
                      className={`product-detail-row ${detailDragOver === id ? "dragover" : ""}`}
                      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setDetailDragOver(id); }}
                      onDragLeave={() => setDetailDragOver((cur) => (cur === id ? null : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDetailDragOver(null);
                        const files = Array.from(e.dataTransfer.files);
                        if (files.length) void uploadMany(files, `detail:${id}`);
                      }}
                    >
                      {m && <img src={m.thumbnailUrl ?? m.url} alt={m.name} />}
                      <label>
                        <span>รูปสินค้า {i + 1} · {m?.name ?? "กำลังโหลด"}</span>
                        <textarea rows={2} maxLength={8000} placeholder="ราคา / รายละเอียด / วิธีสั่งซื้อ (เว้นว่างหากไม่ต้องการคอมเมนต์ใต้รูปนี้)" value={detail.body} onChange={(e) => setDetail(id, { body: e.target.value })} />
                        <div className="detail-media-row">
                          {detail.mediaIds.map((cid) => {
                            const cm = byId.get(cid);
                            return (
                              <div key={cid} className="media-cell on detail-thumb">
                                <img src={cm?.thumbnailUrl ?? cm?.url} alt="comment" />
                                {cm && cm.status !== "ready" && <StatusBadge status={cm.status} />}
                                <button className="media-del" style={{ opacity: 1 }} title="เอารูปคอมเมนต์ออก" onClick={() => setDetail(id, { mediaIds: detail.mediaIds.filter((x) => x !== cid) })}>✕</button>
                              </div>
                            );
                          })}
                          <button type="button" className={`detail-attach ${uploading === `detail:${id}` ? "is-uploading" : ""}`} disabled={uploading !== null} onClick={() => { detailTargetRef.current = id; detailImageRef.current?.click(); }}>
                            {uploading === `detail:${id}` ? (
                              <span className="up-loading"><span className="spin" />{queue && queue.total > 1 ? `อัปโหลด ${queue.done}/${queue.total}` : "กำลังอัปโหลด…"}</span>
                            ) : "+ รูปคอมเมนต์"}
                          </button>
                          {detail.uploadError && <span className="muted" style={{ color: "#f87171" }}>{detail.uploadError}</span>}
                        </div>
                      </label>
                    </div>
                  );
                })}
                <input ref={detailImageRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  const target = `detail:${detailTargetRef.current}`;
                  e.target.value = "";
                  if (files.length) void uploadMany(files, target);
                }} />
              </div>
            )}
          </div>

          <div className="card">
            <div className="sec-head">
              <span className="sec-num">3</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={useFirstComment}
                  onChange={(e) => {
                    setUseFirstComment(e.target.checked);
                    if (e.target.checked && !draftComments.length) setDraftComments([newComment(mediaIds.length === 1 ? mediaIds[0]! : null)]);
                  }}
                />
                <span className="sw-track" />
                คอมเมนต์ใต้โพสต์
              </label>
              <span className="hint">optional — 1 comment = 1 image</span>
              {useFirstComment && (
                <label className="delay-input">
                  delay
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={commentDelay}
                    onChange={(e) => setCommentDelay(Math.max(0, Number(e.target.value) || 0))}
                  />
                  วินาที/คอมเมนต์
                </label>
              )}
            </div>
            {useFirstComment && (
              <>
                <div className="comment-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                  e.preventDefault();
                  void uploadBatch(Array.from(e.dataTransfer.files));
                }}>
                  <strong>ลากรูปคอมเมนต์หลายรูปมาวางที่นี่</strong>
                  <span className="muted">สร้างหนึ่งแถวคอมเมนต์ต่อหนึ่งรูป — เริ่มต้นอยู่ใต้โพสต์หลัก เลือกย้ายไปใต้รูปสินค้าได้ในแต่ละแถว</span>
                  <button type="button" className="ghost" disabled={batchActive} onClick={() => batchFileRef.current?.click()}>เลือกหลายรูป</button>
                  <input ref={batchFileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => {
                    void uploadBatch(Array.from(e.target.files ?? [])); e.target.value = "";
                  }} />
                </div>
                {draftComments.map((c, i) => {
                  const attached = c.mediaId ? byId.get(c.mediaId) : undefined;
                  return (
                    <div key={c.id} className="comment-block">
                      <div className="row-between" style={{ margin: "0 0 8px" }}>
                        <span className="muted" style={{ fontSize: 13 }}>คอมเมนต์ {i + 1}</span>
                        {draftComments.length > 1 && (
                          <button className="link" style={{ color: "#f87171" }} onClick={() => setDraftComments((cur) => cur.filter((x) => x.id !== c.id))}>ลบ</button>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        maxLength={8000}
                        placeholder="เช่น ราคา / ช่องทางสั่งซื้อ / ทัก inbox…"
                        value={c.body}
                        onChange={(e) => setDraftComments((cur) => cur.map((x) => (x.id === c.id ? { ...x, body: e.target.value } : x)))}
                      />
                      {mediaIds.length > 0 && (
                        <div className="comment-target">
                          <span className="muted" style={{ fontSize: 12 }}>คอมเมนต์นี้แสดงใต้:</span>
                          <div className="target-picker">
                            <button type="button" className={`target-chip ${!c.targetMediaId ? "on" : ""}`}
                              onClick={() => setDraftComments((cur) => cur.map((x) => x.id === c.id ? { ...x, targetMediaId: null } : x))}>
                              โพสต์หลัก
                            </button>
                            {mediaIds.map((id, index) => {
                              const pm = byId.get(id);
                              return (
                                <button key={id} type="button" title={`รูปสินค้า ${index + 1}: ${pm?.name ?? id}`}
                                  className={`target-chip target-photo ${c.targetMediaId === id ? "on" : ""}`}
                                  onClick={() => setDraftComments((cur) => cur.map((x) => x.id === c.id ? { ...x, targetMediaId: id } : x))}>
                                  {pm && <img src={pm.thumbnailUrl ?? pm.url} alt={`รูป ${index + 1}`} />}
                                  <span>{index + 1}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {c.fileName && <p className={c.uploadState === "uploading" ? "uploading-note" : "muted"}>{c.fileName} {c.uploadState === "uploading" ? "— กำลังอัปโหลด" : ""}</p>}
                      {c.uploadError && <p className="error-box">{c.uploadError} — เลือกรูปใหม่ในแถวนี้หรือลบแถว</p>}
                      <div className="media-grid" style={{ marginTop: 8 }}>
                        <button type="button" className={`media-cell upload ${uploading === c.id ? "is-uploading" : ""}`} disabled={uploading !== null} onClick={() => commentFileRefs.current[c.id]?.click()}>
                          {uploading === c.id ? (
                            <span className="up-loading"><span className="spin" />กำลังอัปโหลด…</span>
                          ) : (<><span className="up-icon">+</span>รูป</>)}
                        </button>
                        <input
                          ref={(el) => { commentFileRefs.current[c.id] = el; }}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setDraftComments((cur) => cur.map((x) => x.id === c.id ? { ...x, uploadState: "uploading", uploadError: undefined } : x));
                              void upload(e.target.files[0], c.id);
                            }
                            e.target.value = "";
                          }}
                        />
                        {attached && (
                          <div className="media-cell on">
                            <button className="media-del" style={{ opacity: 1 }} title="เอารูปออก" onClick={() => setDraftComments((cur) => cur.map((x) => (x.id === c.id ? { ...x, mediaId: null, fileName: undefined } : x)))}>✕</button>
                            <img src={attached.thumbnailUrl ?? attached.url} alt={attached.name} />
                            <span title={attached.name}>{attached.name}</span>
                            {attached.status !== "ready" && <StatusBadge status={attached.status} />}
                          </div>
                        )}
                      </div>
                      {!attached && (
                        <button className="link" style={{ marginTop: 6 }} onClick={() => setShowCommentLib((v) => (v === c.id ? null : c.id))}>
                          {showCommentLib === c.id ? "▾ ซ่อนคลังรูป" : "▸ เลือกรูปจากคลังเดิม"}
                        </button>
                      )}
                      {showCommentLib === c.id && !attached && (
                        <div className="media-grid" style={{ marginTop: 8 }}>
                          {readyMedia.map((m) => (
                            <button key={m.id} type="button" className="media-cell" onClick={() => { setDraftComments((cur) => cur.map((x) => (x.id === c.id ? { ...x, mediaId: m.id, uploadState: undefined, uploadError: undefined } : x))); setShowCommentLib(null); }}>
                              <img src={m.thumbnailUrl ?? m.url} alt={m.name} />
                              <span title={m.name}>{m.name}</span>
                            </button>
                          ))}
                          {!readyMedia.length && <p className="muted">คลังว่าง — upload รูปใหม่ด้านบน</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button className="link" onClick={() => setDraftComments((cur) => [...cur, newComment(mediaIds.length === 1 ? mediaIds[0]! : null)])}>
                  + เพิ่มคอมเมนต์อีก
                </button>
                {pendingMedia && <p className="muted">รอประมวลผลรูปให้พร้อมก่อนเผยแพร่ หากรูปขึ้น failed ให้ลบแล้วอัปโหลดใหม่</p>}
                <p className="muted" style={{ marginTop: 8 }}>รูปในคอมเมนต์คือรูปแนบของคอมเมนต์; ค่าเริ่มต้นแสดงใต้โพสต์หลัก — เลือก "ใต้รูปสินค้า" ในดรอปดาวน์หากต้องการให้ปรากฏใต้รูปนั้นบน Facebook</p>
              </>
            )}
          </div>

          <div className="publish-bar">
            <div className="summary">
              <strong>{summary}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {!selected.size
                  ? "เลือกเพจอย่างน้อย 1 เพจ"
                  : pendingMedia
                    ? "รอประมวลผลรูปให้พร้อมก่อนเผยแพร่ — ดู badge บนรูป"
                    : uploading !== null || batchActive
                      ? "กำลังอัปโหลดรูป…"
                      : draftComments.some((c) => c.uploadState === "failed")
                        ? "มีรูปคอมเมนต์อัปโหลดไม่สำเร็จ — ลบหรือเลือกใหม่"
                        : "Publishes immediately"}
              </div>
            </div>
            <div className="pb-actions">
              <button className="btn-primary" disabled={busy || !canPublish} onClick={publish}>
                {busy ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
