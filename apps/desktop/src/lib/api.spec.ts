import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
});

describe("session refresh", () => {
  it("rotates a refresh token only once when requests expire together", async () => {
    let refreshes = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL, init: RequestInit) => {
      if (input.pathname.endsWith("/auth/refresh")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(JSON.stringify({ accessToken: "new", refreshToken: "refresh-2" }), { status: 200 });
      }
      return init.headers && (init.headers as Record<string, string>).authorization === "Bearer new"
        ? new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })
        : new Response("{}", { status: 401 });
    }));
    const { api, session } = await import("./api");
    session.set({ accessToken: "expired", refreshToken: "refresh-1", workspaceId: null, email: "test@example.com" });
    await Promise.all([api.listPages(), api.listPages()]);
    expect(refreshes).toBe(1);
    expect(session.getRefreshToken()).toBe("refresh-2");
    session.clear();
    vi.unstubAllGlobals();
  });
});
