import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

/** Meta OAuth lands here with ?code&state — exchange them via the backend. */
export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Completing Facebook connection…");

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error_description") ?? params.get("error");
    if (err) {
      setStatus(`Facebook returned an error: ${err}`);
      return;
    }
    if (!code || !state) {
      setStatus("Missing code/state in callback URL");
      return;
    }
    api
      .exchangeMetaCode(code, state)
      .then((a) => {
        setStatus(`Connected: ${a.displayName}. Redirecting…`);
        setTimeout(() => navigate("/accounts"), 1200);
      })
      .catch((e: Error) => setStatus(`Exchange failed: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="login-wrap">
      <div className="card login-card" style={{ textAlign: "center" }}>
        <h2>Facebook Connect</h2>
        <p className="muted">{status}</p>
        <button className="link" onClick={() => navigate("/accounts")}>Back to Accounts</button>
      </div>
    </div>
  );
}
