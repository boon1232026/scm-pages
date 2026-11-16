import { useState } from "react";
import { api } from "../lib/api";
import { Err, fmtDate, useQuery } from "../lib/hooks";

export default function Configuration() {
  const configs = useQuery(() => api.listConfigurations(), []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"post" | "comment" | "campaign">("post");
  const [payload, setPayload] = useState('{\n  "pageIds": [],\n  "body": "",\n  "mediaIds": []\n}');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        throw new Error("Payload must be valid JSON");
      }
      await api.saveConfiguration({ name, kind, payload: parsed });
      setName("");
      configs.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Configuration</h2>
      <Err msg={error ?? configs.error} />
      <div className="card">
        <h3>Save configuration</h3>
        <div className="row">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="post">Post recipe</option>
            <option value="comment">Comment recipe</option>
            <option value="campaign">Campaign</option>
          </select>
        </div>
        <textarea rows={6} className="mono" value={payload} onChange={(e) => setPayload(e.target.value)} />
        <button disabled={busy || !name} onClick={save}>{busy ? "…" : "Save"}</button>
      </div>
      <div className="card">
        <h3>Saved configurations</h3>
        {configs.loading ? (
          <p className="muted">Loading…</p>
        ) : !configs.data?.length ? (
          <p className="muted">None saved.</p>
        ) : (
          configs.data.map((c) => (
            <div key={c.id} className="template-row">
              <div>
                <strong>{c.name}</strong> <span className="badge">{c.kind}</span>{" "}
                <span className="muted">{fmtDate(c.updatedAt)}</span>
                <pre className="muted">{JSON.stringify(c.payload, null, 1).slice(0, 200)}</pre>
              </div>
              <button className="danger" onClick={() => api.deleteConfiguration(c.id).then(configs.refetch)}>Delete</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
