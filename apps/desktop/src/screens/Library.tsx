import { useRef, useState } from "react";
import { api } from "../lib/api";
import { Err, StatusBadge, useQuery } from "../lib/hooks";

/** Real upload: ticket → PUT bytes to S3 → complete → worker processes via Sharp. */
export default function Library() {
  const [search, setSearch] = useState("");
  const media = useQuery(() => api.listMedia(search ? { search } : undefined), [search]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ticket = await api.createUpload({
        fileName: file.name,
        mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
        sizeBytes: file.size,
      });
      const put = await fetch(ticket.uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`S3 upload failed: HTTP ${put.status}`);
      await api.completeUpload(ticket.mediaId);
      // processing is async in the worker — refresh shortly after
      setTimeout(media.refetch, 2500);
      media.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Product Library</h2>
      <Err msg={error} />
      <div className="card">
        <div className="row-between">
          <input placeholder="Search media…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
          <button disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Uploading…" : "Upload image"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
      </div>
      <div className="card">
        {media.loading ? (
          <p className="muted">Loading…</p>
        ) : !media.data?.items.length ? (
          <p className="muted">No media yet.</p>
        ) : (
          <div className="media-grid">
            {media.data.items.map((m) => (
              <div key={m.id} className="media-cell">
                {m.status === "ready" ? <img src={m.thumbnailUrl ?? m.url} alt={m.name} /> : <div className="media-ph" />}
                <span>{m.name}</span>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
