import { SocialCommerceClient } from "@scm/sdk";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

/** In-memory for the Phase-1 shell. Phase 5: tokens in OS keychain via Tauri plugin. */
let accessToken: string | null = null;
let workspaceId: string | null = null;

export const session = {
  getAccessToken: () => accessToken,
  setAccessToken: (t: string | null) => (accessToken = t),
  getWorkspaceId: () => workspaceId,
  setWorkspaceId: (w: string | null) => (workspaceId = w),
};

export const api = new SocialCommerceClient({
  baseUrl: API_BASE_URL,
  getAccessToken: session.getAccessToken,
  getWorkspaceId: session.getWorkspaceId,
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
