import { SocialCommerceClient } from "@scm/sdk";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const LS_KEY = "scm.session.v1";

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  workspaceId: string | null;
  email: string;
}

/** Persisted via localStorage for dev; Tauri secure-store plugin can replace this. */
function load(): StoredSession | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
function save(s: StoredSession | null) {
  if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
  else localStorage.removeItem(LS_KEY);
}

let current = load();
const listeners = new Set<() => void>();

export const session = {
  getAccessToken: () => current?.accessToken ?? null,
  getRefreshToken: () => current?.refreshToken ?? null,
  getWorkspaceId: () => current?.workspaceId ?? null,
  getEmail: () => current?.email ?? null,
  isAuthed: () => !!current?.accessToken,
  set(s: StoredSession) {
    current = s;
    save(s);
    listeners.forEach((f) => f());
  },
  setWorkspaceId(w: string | null) {
    if (!current) return;
    current = { ...current, workspaceId: w };
    save(current);
    listeners.forEach((f) => f());
  },
  clear() {
    current = null;
    save(null);
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

export const api = new SocialCommerceClient({
  baseUrl: API_BASE_URL,
  getAccessToken: session.getAccessToken,
  getWorkspaceId: session.getWorkspaceId,
  onUnauthorized: async () => {
    const rt = session.getRefreshToken();
    if (!rt) return false;
    try {
      const r = await api.refresh(rt);
      const cur = load();
      if (!cur) return false;
      session.set({ ...cur, accessToken: r.accessToken, refreshToken: r.refreshToken });
      return true;
    } catch {
      session.clear();
      return false;
    }
  },
});

export interface HealthResponse {
  status: string;
  checks: { db: string };
  time: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

export { API_BASE_URL };
