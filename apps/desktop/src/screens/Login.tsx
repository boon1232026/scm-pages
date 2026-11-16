import { useState } from "react";
import { api, session } from "../lib/api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register(workspaceName ? { email, password, displayName, workspaceName } : { email, password, displayName });
      const ws = (await api.listWorkspaces().catch(() => []))[0];
      session.set({
        accessToken: res.tokens.accessToken,
        refreshToken: res.tokens.refreshToken,
        workspaceId: ws?.id ?? null,
        email: res.user.email,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h2>Social Commerce Manager</h2>
        <p className="muted">{mode === "login" ? "Sign in to your workspace" : "Create your account"}</p>
        {mode === "register" && (
          <>
            <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <input placeholder="Workspace / shop name" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
          </>
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {error && <div className="error-box">{error}</div>}
        <button disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
