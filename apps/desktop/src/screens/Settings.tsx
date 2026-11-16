import { api, API_BASE_URL, session } from "../lib/api";
import { Err, useQuery } from "../lib/hooks";

export default function Settings() {
  const me = useQuery(() => api.me(), []);
  const workspaces = useQuery(() => api.listWorkspaces(), []);

  async function switchWorkspace(id: string) {
    session.setWorkspaceId(id);
  }
  async function logout() {
    const rt = session.getRefreshToken();
    if (rt) await api.logout(rt).catch(() => undefined);
    session.clear();
  }

  return (
    <>
      <h2>Settings</h2>
      <Err msg={me.error} />
      <div className="card">
        <h3>Profile</h3>
        <p>
          {me.data?.displayName ?? "…"} <span className="muted">({me.data?.email ?? session.getEmail()})</span>
        </p>
      </div>
      <div className="card">
        <h3>Workspace</h3>
        <select value={session.getWorkspaceId() ?? ""} onChange={(e) => switchWorkspace(e.target.value)}>
          {workspaces.data?.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <p className="muted">Current workspace determines which pages, posts and media are visible.</p>
      </div>
      <div className="card">
        <h3>Backend</h3>
        <p className="mono muted">{API_BASE_URL}/api/v1</p>
      </div>
      <div className="card">
        <button className="danger" onClick={logout}>Sign out</button>
      </div>
    </>
  );
}
