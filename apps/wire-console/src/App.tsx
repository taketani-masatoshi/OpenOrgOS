import { useCallback, useEffect, useState } from "react";
import { OperatorShell } from "@ops-shared/OperatorShell";
import { formatOperatorSessionLabel } from "@ops-shared/formatOperatorSessionLabel";
import { buildCommunityConsoleStartUrl } from "@ops-shared/community-console-handoff";
import { PasskeyAuthPanel } from "@ops-shared/PasskeyAuthPanel";
import { PasskeySettingsPage } from "@ops-shared/PasskeySettingsPage";
import type { PasskeyCredentialsApi } from "@ops-shared/passkey-credentials-client";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import { api, type AuthConfig, type TenantSummary, type User } from "./api";
import { MailWorkbench } from "./MailWorkbench";
import { loginWithWebAuthn } from "./webauthn-login";
import { registerWithWebAuthn, registerSettlementWithWebAuthn } from "./webauthn-register";

function isPasskeySettingsPath(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/settings");
}

const passkeyApi: PasskeyCredentialsApi = (path, init) =>
  api(path.replace(/^\/chat\/v1/, "/console/v1"), init);

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [passkey, setPasskey] = useState("orgos-dev");
  const [prodToken, setProdToken] = useState("");
  const [idToken, setIdToken] = useState("");
  const [operatorId, setOperatorId] = useState("OP-001");
  const [approverId, setApproverId] = useState("段燕燕");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [webAuthnBusy, setWebAuthnBusy] = useState(false);

  const userMsgOpts = {
    expectedOrigin: authConfig?.webauthn?.origin,
    rpId: authConfig?.webauthn?.rp_id,
  };

  const refreshAuthConfig = useCallback(async () => {
    const cfg = await api<{ ok: boolean } & AuthConfig>("/console/v1/auth/config");
    setAuthConfig(cfg);
  }, []);

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
    let cancelled = false;
    void api<{ ok: boolean } & AuthConfig>("/console/v1/auth/config")
      .then((cfg) => {
        if (!cancelled) setAuthConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthConfig({
            mode: "dev",
            dev_login_allowed: true,
            prod_default_adapter: "oidc",
          });
        }
      });
    void loadSession();
    return () => {
      cancelled = true;
    };
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

  async function registerWebAuthn(opts?: { bootstrap_token?: string }) {
    setWebAuthnBusy(true);
    setError(null);
    try {
      const op = user?.operator_id ?? operatorId.trim();
      const appr = user?.approver_id ?? approverId.trim();
      await registerWithWebAuthn(api, {
        operator_id: op,
        approver_id: appr,
        bootstrap_token: opts?.bootstrap_token,
      });
      await loadSession();
      await refreshAuthConfig();
    } catch (err) {
      setError(webauthnUserMessage(err, { ...userMsgOpts, purpose: "login" }));
    } finally {
      setWebAuthnBusy(false);
    }
  }

  async function loginWebAuthn() {
    setWebAuthnBusy(true);
    setError(null);
    try {
      await loginWithWebAuthn(api, { e2e: authConfig?.webauthn_e2e_login });
      await loadSession();
    } catch (err) {
      setError(webauthnUserMessage(err, { ...userMsgOpts, purpose: "login" }));
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
    return (
      <div className="auth-page">
        <header className="auth-header">
          <div className="auth-header-inner">
            <a className="auth-brand" href="https://oorgos.org">
              OpenOrgOS
            </a>
          </div>
        </header>
        <section className="auth-hero">
          <div className="auth-hero-inner">
            <h1>この Mac で入る</h1>
            <p className="auth-lead">読み込み中…</p>
          </div>
        </section>
      </div>
    );
  }

  if (!user) {
    const prodMode = authConfig?.mode === "prod";
    const oidcMode = prodMode && authConfig?.prod_adapter === "oidc";
    const webAuthnMode = prodMode && authConfig?.prod_adapter === "webauthn";
    const showRegister = webAuthnMode && Boolean(authConfig?.webauthn?.registration_allowed);
    const showSignIn = webAuthnMode && (authConfig?.webauthn?.credential_count ?? 0) > 0;
    const settingsHandoff =
      isPasskeySettingsPath() &&
      Boolean(authConfig?.webauthn?.login_registration_requires_session);
    if (webAuthnMode) {
      return (
        <PasskeyAuthPanel
          operatorId={operatorId}
          approverId={approverId}
          onOperatorId={setOperatorId}
          onApproverId={setApproverId}
          showRegister={showRegister || settingsHandoff}
          showSignIn={showSignIn && !settingsHandoff}
          busy={webAuthnBusy}
          error={error}
          onRegister={() => void registerWebAuthn()}
          onSignIn={() => void loginWebAuthn()}
          loginOrigin={authConfig?.webauthn?.origin}
          loginRpId={authConfig?.webauthn?.rp_id}
          registrationRequiresSession={authConfig?.webauthn?.login_registration_requires_session}
          communityHandoffUrl={
            authConfig?.community_handoff
              ? buildCommunityConsoleStartUrl("/settings/")
              : undefined
          }
          settingsPath="/settings/"
          emphasizeBootstrapFlow={settingsHandoff}
        />
      );
    }
    return (
      <div className="auth-page">
        <header className="auth-header">
          <div className="auth-header-inner">
            <a className="auth-brand" href="https://oorgos.org">
              OpenOrgOS
            </a>
          </div>
        </header>
        <section className="auth-hero">
          <div className="auth-hero-inner">
            <h1>オペレーターとして入る</h1>
            <p className="auth-lead">コンソールに入るための認証です。</p>
          </div>
        </section>
        <main className="auth-main">
          <form className="auth-card" onSubmit={login}>
            {oidcMode ? (
              <label className="auth-field">
                <span>OIDC トークン</span>
                <input
                  type="password"
                  value={idToken}
                  onChange={(e) => setIdToken(e.target.value)}
                  autoComplete="off"
                />
              </label>
            ) : prodMode ? (
              <label className="auth-field">
                <span>本番トークン</span>
                <input
                  type="password"
                  value={prodToken}
                  onChange={(e) => setProdToken(e.target.value)}
                  autoComplete="off"
                />
              </label>
            ) : (
              <label className="auth-field">
                <span>開発用パスキー</span>
                <input
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            <label className="auth-field">
              <span>オペレーター</span>
              <input
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="auth-field">
              <span>承認者</span>
              <input
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
                autoComplete="name"
              />
            </label>
            <div className="auth-actions">
              <button type="submit" className="btn btn-primary">
                入る
              </button>
            </div>
            {error ? <p className="auth-error">{error}</p> : null}
          </form>
        </main>
      </div>
    );
  }

  return (
    <OperatorShell
      active="wire"
      operatorLabel={
        formatOperatorSessionLabel(user) +
        (authConfig?.mode === "prod" ? " · 本番認証" : "")
      }
      onSignOut={() => void logout()}
      settingsHref="/settings/"
      settingsActive={isPasskeySettingsPath()}
      yojitsuHref="/"
      wireHref={
        import.meta.env.BASE_URL.endsWith("/")
          ? import.meta.env.BASE_URL
          : `${import.meta.env.BASE_URL}/`
      }
      secretaryHref="/secretary/"
      stewardHref="/steward/"
      orgHref="/org/"
    >
      {isPasskeySettingsPath() ? (
        <PasskeySettingsPage
          webAuthnMode={authConfig?.mode === "prod" && authConfig.prod_adapter === "webauthn"}
          api={passkeyApi}
          operatorId={user.operator_id}
          approverId={user.approver_id}
          policy={{
            login_registration_bootstrap: authConfig?.webauthn?.login_registration_bootstrap,
            bootstrap_token_required: authConfig?.webauthn?.bootstrap_token_required,
            registration_allowed: authConfig?.webauthn?.registration_allowed,
            settlement_registration_allowed: authConfig?.webauthn?.settlement_registration_allowed,
            additional_login_registration_allowed:
              authConfig?.webauthn?.additional_login_registration_allowed,
            credential_count: authConfig?.webauthn?.credential_count,
            settlement_count: authConfig?.webauthn?.settlement_count,
          }}
          busy={webAuthnBusy}
          error={error}
          onRegisterLogin={(opts) => void registerWebAuthn(opts)}
          onRegisterSettlement={async () => {
            setWebAuthnBusy(true);
            setError(null);
            try {
              await registerSettlementWithWebAuthn(api, {
                operator_id: user.operator_id,
                approver_id: user.approver_id,
              });
              await loadSession();
              await refreshAuthConfig();
            } catch (err) {
              setError(
                webauthnUserMessage(err, { ...userMsgOpts, purpose: "settlement" }),
              );
            } finally {
              setWebAuthnBusy(false);
            }
          }}
          onRefreshAuthConfig={refreshAuthConfig}
          backLinks={[{ href: "/wire/", label: "Wire に戻る" }]}
          expectedOrigin={authConfig?.webauthn?.origin}
          rpId={authConfig?.webauthn?.rp_id}
        />
      ) : (
        <div className="wire-workspace">
          <MailWorkbench tenants={tenants} />
        </div>
      )}
    </OperatorShell>
  );
}
