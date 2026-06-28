import { useCallback, useEffect, useState } from "react";
import { api, type AuthConfig, type TenantSummary, type User } from "./api";
import { TenantDashboard } from "./TenantDashboard";
import { loginWithWebAuthn } from "./webauthn-login";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [passkey, setPasskey] = useState("orgos-dev");
  const [prodToken, setProdToken] = useState("");
  const [idToken, setIdToken] = useState("");
  const [operatorId, setOperatorId] = useState("Wire Console");
  const [approverId, setApproverId] = useState("南木健一");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [webAuthnBusy, setWebAuthnBusy] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const me = await api<{ ok: boolean; user: User }>("/console/v1/auth/me");
      setUser(me.user);
      const t = await api<{ ok: boolean; tenants: TenantSummary[] }>("/console/v1/tenants");
      setTenants(t.tenants);
      setError(null);
    } catch {
      setUser(null);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void api<{ ok: boolean } & AuthConfig>("/console/v1/auth/config")
      .then(setAuthConfig)
      .catch(() =>
        setAuthConfig({
          mode: "dev",
          dev_login_allowed: true,
          prod_default_adapter: "oidc",
        })
      );
    void loadSession();
  }, [loadSession]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body =
        authConfig?.mode === "prod"
          ? authConfig.prod_adapter === "oidc"
            ? { id_token: idToken, approver_id: approverId, operator_id: operatorId }
            : {
                prod_token: prodToken,
                operator_id: operatorId,
                approver_id: approverId,
              }
          : {
              passkey,
              approver_id: approverId,
              operator_id: operatorId,
            };
      const res = await api<{ ok: boolean; user: User }>("/console/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setUser(res.user);
      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loginWebAuthn() {
    setWebAuthnBusy(true);
    setError(null);
    try {
      await loginWithWebAuthn(api, { e2e: authConfig?.webauthn_e2e_login });
      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWebAuthnBusy(false);
    }
  }

  async function logout() {
    await api("/console/v1/auth/logout", { method: "POST" });
    setUser(null);
    setTenants([]);
  }

  if (loading) {
    return <div className="shell wide">Loading…</div>;
  }

  if (!user) {
    const prodMode = authConfig?.mode === "prod";
    const oidcMode = prodMode && authConfig?.prod_adapter === "oidc";
    const webAuthnMode = prodMode && authConfig?.prod_adapter === "webauthn";
    return (
      <div className="shell login">
        <h1>OrgOS Wire Console</h1>
        <p>Inter-org outbox / inbox · operator UI</p>
        <p className="hint">
          Auth: {authConfig?.mode ?? "dev"}
          {prodMode ? ` · ${authConfig?.prod_adapter ?? "oidc"}` : ""}
          {prodMode && authConfig?.prod_default_adapter === "oidc" ? " · prod default OIDC" : ""}
        </p>
        {webAuthnMode ? (
          <>
            <p className="hint">
              WebAuthn prod login (Wave 4) — register credentials via{" "}
              <code>WIRE_CONSOLE_WEBAUTHN_CREDENTIALS</code>
            </p>
            <button type="button" disabled={webAuthnBusy} onClick={() => void loginWebAuthn()}>
              {webAuthnBusy ? "Signing in…" : "Sign in with passkey"}
            </button>
          </>
        ) : (
          <form onSubmit={login}>
            {oidcMode ? (
              <label>
                OIDC id_token
                <input
                  type="password"
                  value={idToken}
                  onChange={(e) => setIdToken(e.target.value)}
                  autoComplete="off"
                />
              </label>
            ) : prodMode ? (
              <label>
                Prod token (legacy)
                <input
                  type="password"
                  value={prodToken}
                  onChange={(e) => setProdToken(e.target.value)}
                  autoComplete="off"
                />
              </label>
            ) : (
              <label>
                Dev passkey
                <input value={passkey} onChange={(e) => setPasskey(e.target.value)} autoComplete="off" />
              </label>
            )}
            <label>
              Operator
              <input value={operatorId} onChange={(e) => setOperatorId(e.target.value)} autoComplete="off" />
            </label>
            <label>
              Approver
              <input
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
                autoComplete="off"
                placeholder="南木健一"
              />
            </label>
            <button type="submit">Sign in</button>
          </form>
        )}
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="shell wide">
      <header className="app-header">
        <div>
          <h1>Wire Console</h1>
          <p className="subtitle">
            {user.operator_id} · approver {user.approver_id} · {user.mode}
            {authConfig?.mode === "prod" ? " · prod auth" : ""}
          </p>
        </div>
        <button type="button" className="secondary" onClick={logout}>
          Sign out
        </button>
      </header>
      <TenantDashboard tenants={tenants} />
    </div>
  );
}
