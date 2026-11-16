import { api } from "../lib/api";
import { Err, fmtDate, StatusBadge, useQuery } from "../lib/hooks";

export default function Scheduler() {
  const jobs = useQuery(() => api.listScheduledJobs(), []);

  async function cancel(id: string) {
    await api.cancelScheduledJob(id);
    jobs.refetch();
  }

  return (
    <>
      <h2>Scheduler</h2>
      <Err msg={jobs.error} />
      <div className="card">
        <div className="row-between">
          <span className="muted">{jobs.data?.length ?? 0} job(s)</span>
          <button onClick={jobs.refetch}>Refresh</button>
        </div>
        {jobs.loading ? (
          <p className="muted">Loading…</p>
        ) : !jobs.data?.length ? (
          <p className="muted">No scheduled jobs.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Kind</th><th>Run at (Asia/Bangkok)</th><th>Status</th><th>Queue job</th><th /></tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id}>
                  <td>{j.kind}</td>
                  <td>{fmtDate(j.runAt)} <span className="muted">{j.timezone}</span></td>
                  <td><StatusBadge status={j.status} /></td>
                  <td className="mono muted">{j.queueJobId ?? "—"}</td>
                  <td className="actions">
                    {(j.status === "enqueued" || j.status === "pending") && (
                      <button className="danger" onClick={() => cancel(j.id)}>Cancel</button>
                    )}
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
