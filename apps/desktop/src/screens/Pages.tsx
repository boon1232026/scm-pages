import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function Pages() {
  const pages = useQuery(() => api.listPages(), []);

  async function toggle(id: string, enabled: boolean) {
    await api.setPageEnabled(id, enabled);
    pages.refetch();
  }
  async function sync() {
    await api.syncPages();
    pages.refetch();
  }

  return (
    <>
      <h2>Page Management</h2>
      <Err msg={pages.error} />
      <div className="card">
        <div className="row-between">
          <span className="muted">{pages.data?.length ?? 0} page(s) in this workspace</span>
          <button onClick={sync}>Sync from Facebook</button>
        </div>
        {pages.loading ? (
          <p className="muted">Loading…</p>
        ) : !pages.data?.length ? (
          <p className="muted">
            No pages yet — connect a Facebook account first (Facebook Accounts → Connect), then sync.
          </p>
        ) : (
          <table>
            <thead>
              <tr><th>Page</th><th>FB Page ID</th><th>Token</th><th>Token expires</th><th>Enabled</th></tr>
            </thead>
            <tbody>
              {pages.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="mono muted">{p.pageId}</td>
                  <td><StatusBadge status={p.tokenStatus} /></td>
                  <td className="muted">{fmtDate(p.tokenExpiresAt)}</td>
                  <td>
                    <label className="switch">
                      <input type="checkbox" checked={p.isEnabled} onChange={(e) => toggle(p.id, e.target.checked)} />
                    </label>
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
