import { useRef, useState } from "react";
import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

/** Single workspace: compose post + first-comment in one pass, publish to all selected pages. */
export default function Compose() {
  const pages = useQuery(() => api.listPages({ enabled: true }), []);
  const media = useQuery(() => api.listMedia(), []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);

  const [useFirstComment, setUseFirstComment] = useState(false);
  const [commentDelay, setCommentDelay] = useState(30);
  const [draftComments, setDraftComments] = useState<{ body: string; mediaId: string | null }[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"post" | number | null>(null);
  const [showPostLib, setShowPostLib] = useState(false);
  const [showCommentLib, setShowCommentLib] = useState<number | null>(null);
  const postFileRef = useRef<HTMLInputElement>(null);
  const commentFileRefs = useRef<(HTMLInputElement | null)[]>([]);


  const readyMedia = (media.data?.items ?? []).filter((m) => m.status === "ready");
  const kind = mediaIds.length === 0 ? "text" : mediaIds.length === 1 ? "photo" : "multi_photo";

  function toggle(set: Set<string>, id: string) {
    const s = new Set(set);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    return s;
  }

  const items = media.data?.items ?? [];
  const byId = new Map(items.map((m) => [m.id, m]));
  const attachedPost = mediaIds.map((id) => byId.get(id)).filter((m) => !!m);

  async function upload(file: File, target: "post" | number) {
    setUploading(target);
    setError(null);
    try {
      const ticket = await api.createUpload({
        fileName: file.name,
        mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
        sizeBytes: file.size,
      });
      const put = await globalThis.fetch(ticket.uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`S3 upload failed: HTTP ${put.status}`);
      await api.completeUpload(ticket.mediaId);
      if (target === "post") setMediaIds((cur) => [...cur, ticket.mediaId]);
      else setDraftComments((cur) => cur.map((c, i) => (i === target ? { ...c, mediaId: ticket.mediaId } : c)));
      media.refetch();
      setTimeout(media.refetch, 2500);
      setTimeout(media.refetch, 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const post = await api.createPost({
        kind,
        body,
        pageIds: [...selected],
        mediaIds,

        ...(useFirstComment
          ? {
              firstComments: draftComments
                .filter((c) => c.body.trim() || c.mediaId)
                .map((c) => ({
                  ...(c.body.trim() ? { body: c.body.trim() } : {}),
                  ...(c.mediaId ? { mediaId: c.mediaId } : {}),
                })),
              commentDelaySeconds: commentDelay,
            }
          : {}),
        timezone: "Asia/Bangkok",
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(`Post ${post.id.slice(0, 8)}… → ${post.pages.map((p) => `${p.pageName}: ${p.status}`).join(", ")}`);
      setBody("");
      setMediaIds([]);
      setDraftComments([]);
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
    (!useFirstComment || draftComments.some((c) => c.body.trim() || c.mediaId));

  const summary = [
    `${selected.size} page(s)`,
    mediaIds.length ? `${mediaIds.length} photo(s)` : "text",
    useFirstComment ? `+ ${draftComments.filter((c) => c.body.trim() || c.mediaId).length} comment(s)` : null,
    "now",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <h2>Compose</h2>
      <Err msg={error} />
      {result && <div className="info-box">{result}</div>}

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
                  <label key={p.id} className={`page-chip ${selected.has(p.id) ? "on" : ""}`}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => setSelected((s) => toggle(s, p.id))} />
                    {p.name} <StatusBadge status={p.tokenStatus} />
                  </label>
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


            <span className="field-label">รูปภาพของโพสต์ — {mediaIds.length} attached</span>
            <div className="media-grid">
              <button type="button" className="media-cell upload" disabled={uploading !== null} onClick={() => postFileRef.current?.click()}>
                <span className="up-icon">+</span>
                {uploading === "post" ? "Uploading…" : "Upload"}
              </button>
              <input ref={postFileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "post")} />
              {attachedPost.map((m) => (
                <div key={m.id} className="media-cell on">
                  <button className="media-del" style={{ opacity: 1 }} title="เอารูปออกจากโพสต์" onClick={() => setMediaIds((cur) => cur.filter((x) => x !== m.id))}>✕</button>
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
                  <button key={m.id} type="button" className="media-cell" onClick={() => setMediaIds((cur) => [...cur, m.id])}>
                    <img src={m.thumbnailUrl ?? m.url} alt={m.name} />
                    <span title={m.name}>{m.name}</span>
                  </button>
                ))}
                {!readyMedia.filter((m) => !mediaIds.includes(m.id)).length && <p className="muted">คลังว่าง — upload รูปใหม่ด้านบน</p>}
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
                    if (e.target.checked && !draftComments.length) setDraftComments([{ body: "", mediaId: null }]);
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
                {draftComments.map((c, i) => {
                  const attached = c.mediaId ? byId.get(c.mediaId) : undefined;
                  return (
                    <div key={i} className="comment-block">
                      <div className="row-between" style={{ margin: "0 0 8px" }}>
                        <span className="muted" style={{ fontSize: 13 }}>คอมเมนต์ {i + 1}</span>
                        {draftComments.length > 1 && (
                          <button className="link" style={{ color: "#f87171" }} onClick={() => setDraftComments((cur) => cur.filter((_, x) => x !== i))}>ลบ</button>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        placeholder="เช่น ราคา / ช่องทางสั่งซื้อ / ทัก inbox…"
                        value={c.body}
                        onChange={(e) => setDraftComments((cur) => cur.map((x, xi) => (xi === i ? { ...x, body: e.target.value } : x)))}
                      />
                      <div className="media-grid" style={{ marginTop: 8 }}>
                        <button type="button" className="media-cell upload" disabled={uploading !== null} onClick={() => commentFileRefs.current[i]?.click()}>
                          <span className="up-icon">+</span>
                          {uploading === i ? "Uploading…" : "รูป"}
                        </button>
                        <input
                          ref={(el) => { commentFileRefs.current[i] = el; }}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], i)}
                        />
                        {attached && (
                          <div className="media-cell on">
                            <button className="media-del" style={{ opacity: 1 }} title="เอารูปออก" onClick={() => setDraftComments((cur) => cur.map((x, xi) => (xi === i ? { ...x, mediaId: null } : x)))}>✕</button>
                            <img src={attached.thumbnailUrl ?? attached.url} alt={attached.name} />
                            <span title={attached.name}>{attached.name}</span>
                            {attached.status !== "ready" && <StatusBadge status={attached.status} />}
                          </div>
                        )}
                      </div>
                      {!attached && (
                        <button className="link" style={{ marginTop: 6 }} onClick={() => setShowCommentLib((v) => (v === i ? null : i))}>
                          {showCommentLib === i ? "▾ ซ่อนคลังรูป" : "▸ เลือกรูปจากคลังเดิม"}
                        </button>
                      )}
                      {showCommentLib === i && !attached && (
                        <div className="media-grid" style={{ marginTop: 8 }}>
                          {readyMedia.map((m) => (
                            <button key={m.id} type="button" className="media-cell" onClick={() => { setDraftComments((cur) => cur.map((x, xi) => (xi === i ? { ...x, mediaId: m.id } : x))); setShowCommentLib(null); }}>
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
                <button className="link" onClick={() => setDraftComments((cur) => [...cur, { body: "", mediaId: null }])}>
                  + เพิ่มคอมเมนต์อีก
                </button>
                <p className="muted" style={{ marginTop: 8 }}>ทุกคอมเมนต์จะถูกส่งใต้โพสต์ใหม่ของทุกเพจที่เลือกอัตโนมัติ</p>
              </>
            )}
          </div>

          <div className="publish-bar">
            <div className="summary">
              <strong>{summary}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Publishes immediately
              </div>
            </div>
            <div className="row" style={{ margin: 0, alignItems: "center" }}>

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
