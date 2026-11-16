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
          <div className="page-list">
            {pages.data.map((p) => (
              <div key={p.id} className={`hrow ${p.isEnabled ? "" : "off"}`}>
                {p.avatarUrl ? (
                  <img className="hrow-thumb" src={p.avatarUrl} alt="" />
                ) : (
                  <div className="hrow-thumb hrow-thumb-ph">{p.name.slice(0, 1)}</div>
                )}
                <div className="hrow-body">
                  <div className="hrow-title">{p.name}</div>
                  <div className="hrow-meta">
                    <span className="mono">ID: {p.pageId}</span>
                    <StatusBadge status={p.tokenStatus} />
                    {p.tokenExpiresAt && <span>token หมด {fmtDate(p.tokenExpiresAt)}</span>}
                    {p.followersCount != null && <span>ผู้ติดตาม {p.followersCount.toLocaleString()}</span>}
                  </div>
                </div>
                <div className="hrow-side">
                  <label className="switch">
                    <input type="checkbox" checked={p.isEnabled} onChange={(e) => toggle(p.id, e.target.checked)} />
                    <span className="sw-track" />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
