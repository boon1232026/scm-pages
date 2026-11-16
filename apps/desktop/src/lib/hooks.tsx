import { useCallback, useEffect, useState } from "react";

export interface Query<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Minimal data-fetch hook — every screen pulls real API state through this. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const refetch = useCallback(() => {
    setLoading(true);
    run()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [run]);
  useEffect(refetch, [refetch]);
  return { data, loading, error, refetch };
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export function StatusBadge({ status }: { status: string }) {
  const cls = ["published", "ready", "ok", "valid"].includes(status)
    ? "ok"
    : ["failed", "expired", "invalid"].includes(status)
      ? "err"
      : "warn";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function Err({ msg }: { msg: string | null }) {
  return msg ? <div className="error-box">{msg}</div> : null;
}
