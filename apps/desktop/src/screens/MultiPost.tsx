import { useState } from "react";
import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function MultiPost() {
  const pages = useQuery(() => api.listPages({ enabled: true }), []);
  const media = useQuery(() => api.listMedia(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"text" | "photo" | "multi_photo">("text");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readyMedia = (media.data?.items ?? []).filter((m) => m.status === "ready");

  function togglePage(id: string) {
    const s = new Set(selected);
    if (s.has(id)) {
      s.delete(id);
    } else {
      s.add(id);
    }
    setSelected(s);
  }
  function toggleMedia(id: string) {
    setMediaIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
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
        mediaIds: kind === "text" ? [] : mediaIds,
        timezone: "Asia/Bangkok",
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(`Post ${post.id.slice(0, 8)}… → ${post.pages.map((p) => `${p.pageName}:${p.status}`).join(", ")}`);
      setBody("");
      setMediaIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Multi-Post</h2>
      <Err msg={error} />
      {result && <div className="info-box">{result}</div>}
      <div className="card">
        <h3>Target pages</h3>
        {!pages.data?.length ? (
          <p className="muted">No enabled pages — enable pages in Page Management first.</p>
        ) : (
          <div className="page-grid">
            {pages.data.map((p) => (
              <label key={p.id} className={`page-chip ${selected.has(p.id) ? "on" : ""}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => togglePage(p.id)} />
                {p.name} <StatusBadge status={p.tokenStatus} />
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <h3>Compose</h3>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="text">Text only</option>
            <option value="photo">Text + 1 photo</option>
            <option value="multi_photo">Text + multiple photos</option>
          </select>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} title="Schedule (optional, Asia/Bangkok)" />
        </div>
        <textarea rows={5} placeholder="Post text…" value={body} onChange={(e) => setBody(e.target.value)} />
        {kind !== "text" && (
          <>
            <h4>Attach media ({mediaIds.length} selected)</h4>
            <div className="media-grid">
              {readyMedia.map((m) => (
                <button key={m.id} type="button" className={`media-cell ${mediaIds.includes(m.id) ? "on" : ""}`} onClick={() => toggleMedia(m.id)}>
                  <img src={m.thumbnailUrl ?? m.url} alt={m.name} />
                  <span>{m.name}</span>
                </button>
              ))}
              {!readyMedia.length && <p className="muted">No ready media — upload in Product Library.</p>}
            </div>
          </>
        )}
        <div className="row-between" style={{ marginTop: 12 }}>
          <span className="muted">{scheduledAt ? `Scheduled: ${fmtDate(new Date(scheduledAt).toISOString())}` : "Publishes immediately"}</span>
          <button disabled={busy || !selected.size || (kind !== "text" && !mediaIds.length)} onClick={publish}>
            {busy ? "…" : scheduledAt ? "Schedule" : "Publish"} to {selected.size} page(s)
          </button>
        </div>
      </div>
    </>
  );
}
