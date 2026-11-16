import { useEffect, useState } from "react";
import { api, fetchHealth, session, type HealthResponse } from "../lib/api";
import { fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const authed = session.isAuthed();
  const posts = useQuery(() => (authed ? api.listPosts() : Promise.resolve(null)), [authed]);
  const jobs = useQuery(() => (authed ? api.listScheduledJobs() : Promise.resolve(null)), [authed]);

  useEffect(() => {
    const load = () =>
      fetchHealth()
        .then((h) => {
          setHealth(h);
          setHealthErr(null);
        })
        .catch((e: Error) => {
          setHealth(null);
          setHealthErr(e.message);
        });
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const stats = posts.data
    ? posts.data.items.reduce<Record<string, number>>((m, p) => {
        m[p.status] = (m[p.status] ?? 0) + 1;
        return m;
      }, {})
    : null;
  const upcoming = jobs.data?.filter((j) => j.status === "enqueued" || j.status === "pending") ?? [];

  return (
    <>
      <h2>Dashboard</h2>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Backend API</h3>
        {health ? (
          <>
            <span className={`badge ${health.status === "ok" ? "ok" : "warn"}`}>{health.status.toUpperCase()}</span>{" "}
            <span className="muted">database: {health.checks.db} · {health.time}</span>
          </>
        ) : (
          <>
            <span className="badge err">OFFLINE</span>{" "}
            <span className="muted">{healthErr ?? "connecting…"} — start the API first</span>
          </>
        )}
      </div>
      {authed && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Post status</h3>
            {stats ? (
              <div className="row">
                {Object.entries(stats).map(([s, n]) => (
                  <span key={s} className="stat"><StatusBadge status={s} /> {n}</span>
                ))}
                {!Object.keys(stats).length && <span className="muted">No posts yet.</span>}
              </div>
            ) : (
              <p className="muted">Loading…</p>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Upcoming jobs</h3>
            {!upcoming.length ? (
              <p className="muted">Nothing scheduled.</p>
            ) : (
              upcoming.slice(0, 10).map((j) => (
                <p key={j.id} className="muted">{fmtDate(j.runAt)} — {j.kind}</p>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
