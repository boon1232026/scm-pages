import { useState } from "react";
import { api } from "../lib/api";
import { Err, useQuery } from "../lib/hooks";

export default function Templates() {
  const templates = useQuery(() => api.listTemplates(), []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"post" | "comment">("post");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.createTemplate({ name, kind, body, mediaIds: [] });
      setName("");
      setBody("");
      templates.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Templates</h2>
      <Err msg={error ?? templates.error} />
      <div className="card">
        <h3>New template</h3>
        <div className="row">
          <input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={kind} onChange={(e) => setKind(e.target.value as "post" | "comment")}>
            <option value="post">Post</option>
            <option value="comment">Comment</option>
          </select>
        </div>
        <textarea rows={4} placeholder="Body text — e.g. {name} {price} THB, order via inbox" value={body} onChange={(e) => setBody(e.target.value)} />
        <button disabled={busy || !name || !body} onClick={create}>{busy ? "…" : "Save template"}</button>
      </div>
      <div className="card">
        <h3>Saved templates</h3>
        {templates.loading ? (
          <p className="muted">Loading…</p>
        ) : !templates.data?.length ? (
          <p className="muted">No templates yet.</p>
        ) : (
          templates.data.map((t) => (
            <div key={t.id} className="template-row">
              <div>
                <strong>{t.name}</strong> <span className="badge">{t.kind}</span>
                <p className="muted">{t.body.slice(0, 120)}</p>
              </div>
              <button className="danger" onClick={() => api.deleteTemplate(t.id).then(templates.refetch)}>Delete</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
