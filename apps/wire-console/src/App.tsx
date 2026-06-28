import { useCallback, useEffect, useState } from "react";
import { api, type AuthConfig, type TenantSummary, type User } from "./api";
import { TenantDashboard } from "./TenantDashboard";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [passkey, setPasskey] = useState("orgos-dev");
  const [prodToken, setProdToken] = useState("");
  const [operatorId, setOperatorId] = useState("Wire Console");
  const [approverId, setApproverId] = useState("南木健一");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      .catch(() => setAuthConfig({ mode: "dev", dev_login_allowed: true, prod_token_required: false }));
    void loadSession();
  }, [loadSession]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body =
        authConfig?.mode === "prod"
          ? {
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
    return (
      <div className="shell login">
        <h1>OrgOS Wire Console</h1>
        <p>Inter-org outbox / inbox · operator UI</p>
        <p className="hint">Auth mode: {authConfig?.mode ?? "dev"}</p>
        <form onSubmit={login}>
          {prodMode ? (
            <label>
              Prod token
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
