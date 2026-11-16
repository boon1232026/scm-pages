import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "../lib/api";

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetchHealth()
        .then((h) => {
          setHealth(h);
          setError(null);
        })
        .catch((e: Error) => {
          setHealth(null);
          setError(e.message);
        });
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <h2>Dashboard</h2>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Backend API</h3>
        {health ? (
          <>
            <span className={`badge ${health.status === "ok" ? "ok" : "warn"}`}>
              {health.status.toUpperCase()}
            </span>{" "}
            <span className="muted">database: {health.checks.db} · {health.time}</span>
          </>
        ) : (
          <>
            <span className="badge err">OFFLINE</span>{" "}
            <span className="muted">
              {error ?? "connecting…"} — start the API with <code>pnpm --filter @scm/api dev</code>
            </span>
          </>
        )}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Overview</h3>
        <p className="muted">
          Publishing stats, upcoming scheduled jobs and notifications appear here once
          authentication lands in Phase 2 and the desktop app is wired in Phase 5.
        </p>
      </div>
    </>
  );
}
