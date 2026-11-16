import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function Accounts() {
  const accounts = useQuery(() => api.listSocialAccounts(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.startMetaOAuth();
      // Real OAuth URL from the backend — open in the SYSTEM browser via Tauri.
      try {
        await openUrl(r.oauthUrl);
      } catch {
        window.open(r.oauthUrl, "_blank");
      }
      setMsg("Complete the Meta login in your browser, then resync this account.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resync(id: string) {
    const r = await api.resyncSocialAccount(id);
    setMsg(`Synced ${r.synced} page(s)`);
    accounts.refetch();
  }

  async function disconnect(id: string) {
    await api.disconnectSocialAccount(id);
    accounts.refetch();
  }

  return (
    <>
      <h2>Facebook Accounts</h2>
      <Err msg={accounts.error} />
      {msg && <div className="info-box">{msg}</div>}
      <div className="card">
        <div className="row-between">
          <span className="muted">{accounts.data?.length ?? 0} connected account(s)</span>
          <button onClick={connect} disabled={busy}>Connect Facebook</button>
        </div>
        {accounts.loading ? (
          <p className="muted">Loading…</p>
        ) : !accounts.data?.length ? (
          <p className="muted">No Facebook accounts connected.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Account</th><th>Status</th><th>Scopes</th><th>Last synced</th><th /></tr>
            </thead>
            <tbody>
              {accounts.data.map((a) => (
                <tr key={a.id}>
                  <td>{a.displayName}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="muted">{a.scopes.join(", ") || "—"}</td>
                  <td className="muted">{fmtDate(a.lastSyncedAt)}</td>
                  <td className="actions">
                    <button onClick={() => resync(a.id)}>Resync</button>
                    <button className="danger" onClick={() => disconnect(a.id)}>Disconnect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
