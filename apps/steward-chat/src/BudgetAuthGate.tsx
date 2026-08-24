import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { OperatorShell, type OperatorShellActive } from "@ops-shared/OperatorShell";
import { formatOperatorSessionLabel } from "@ops-shared/formatOperatorSessionLabel";
import { buildCommunityConsoleStartUrl } from "@ops-shared/community-console-handoff";
import { PasskeyAuthPanel } from "@ops-shared/PasskeyAuthPanel";
import { PasskeySettingsPage } from "@ops-shared/PasskeySettingsPage";
import { registerSettlementPasskey } from "@ops-shared/register-settlement-passkey";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import {
  chatApi,
  fetchAuthConfig,
  fetchMe,
  loginDev,
  logoutChat,
  type AuthConfig,
  type AuthUser,
} from "./api";
import { loginWithWebAuthn } from "./webauthn-login";
import { registerWithWebAuthn } from "./webauthn-register";

function isPasskeySettingsPath(): boolean {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/settings" || path.startsWith("/settings/");
}

function PasskeyAuthLoadingShell() {
  return (
    <div className="auth-page auth-loading">
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

/**
 * Zero-trust gate for budget / agent-chat SPA.
 * WebAuthn uses the same PassKey screen as Wire. Dev login stays in OperatorShell.
 */
export function BudgetAuthGate({
  children,
  active = "yojitsu",
}: {
  children: ReactNode;
  active?: OperatorShellActive;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passkey, setPasskey] = useState("orgos-dev");
  const [operatorId, setOperatorId] = useState("OP-001");
  const [approverId, setApproverId] = useState("段燕燕");
  const [busy, setBusy] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  const webAuthnMode =
    authConfig?.mode === "prod" && authConfig.prod_adapter === "webauthn";

  const settingsPage = isPasskeySettingsPath();

  const userMsgOpts = {
    expectedOrigin: authConfig?.webauthn?.origin,
    rpId: authConfig?.webauthn?.rp_id,
  };

  const refreshAuthConfig = useCallback(async () => {
    const cfg = await fetchAuthConfig().catch(() => null);
    if (cfg) setAuthConfig(cfg);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, config] = await Promise.all([
          fetchMe().catch(() => null),
          fetchAuthConfig().catch(() => null),
        ]);
        if (cancelled) return;
        if (config) setAuthConfig(config);
        setUser(me);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshAfterAuth() {
    const me = await fetchMe();
    setUser(me);
    await refreshAuthConfig();
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await loginDev({
        passkey,
        operator_id: operatorId.trim() || "OP-001",
        approver_id: approverId.trim() || operatorId.trim() || "OP-001",
      });
      setUser(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(opts?: { bootstrap_token?: string }) {
    setBusy(true);
    setError(null);
    try {
      const op = user?.operator_id ?? operatorId.trim();
      const appr = user?.approver_id ?? approverId.trim();
      await registerWithWebAuthn(chatApi, {
        operator_id: op,
        approver_id: appr,
        bootstrap_token: opts?.bootstrap_token,
      });
      await refreshAfterAuth();
    } catch (err) {
      setError(webauthnUserMessage(err, { ...userMsgOpts, purpose: "login" }));
    } finally {
      setBusy(false);
    }
  }

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await loginWithWebAuthn(chatApi, { e2e: authConfig?.webauthn_e2e_login });
      await refreshAfterAuth();
    } catch (err) {
      setError(webauthnUserMessage(err, { ...userMsgOpts, purpose: "login" }));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    try {
      await logoutChat();
    } catch {
      /* still clear local session */
    }
    setUser(null);
  }

  async function enrollSettlementPasskey() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await registerSettlementPasskey(chatApi, {
        operator_id: user.operator_id,
        approver_id: user.approver_id,
      });
      await refreshAuthConfig();
    } catch (err) {
      setError(webauthnUserMessage(err, { ...userMsgOpts, purpose: "settlement" }));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  if (loading && webAuthnMode) {
    return <PasskeyAuthLoadingShell />;
  }

  if (!loading && !user && webAuthnMode) {
    const showRegister = Boolean(authConfig?.webauthn?.registration_allowed);
    const showSignIn = (authConfig?.webauthn?.credential_count ?? 0) > 0;
    const emphasizeBootstrapFlow =
      settingsPage && Boolean(authConfig?.webauthn?.login_registration_requires_session);
    return (
      <PasskeyAuthPanel
        operatorId={operatorId}
        approverId={approverId}
        onOperatorId={setOperatorId}
        onApproverId={setApproverId}
        showRegister={showRegister || emphasizeBootstrapFlow}
        showSignIn={showSignIn && !emphasizeBootstrapFlow}
        busy={busy}
        error={error}
        onRegister={() => void onRegister()}
        onSignIn={() => void onSignIn()}
        loginOrigin={authConfig?.webauthn?.origin}
        loginRpId={authConfig?.webauthn?.rp_id}
        registrationRequiresSession={authConfig?.webauthn?.login_registration_requires_session}
        communityHandoffUrl={
          authConfig?.community_handoff
            ? buildCommunityConsoleStartUrl("/settings/")
            : undefined
        }
        settingsPath="/settings/"
        emphasizeBootstrapFlow={emphasizeBootstrapFlow}
      />
    );
  }

  const operatorLabel = user
    ? formatOperatorSessionLabel(user)
    : loading
      ? "認証確認中…"
      : "未ログイン";

  const mainContent =
    settingsPage && user ? (
      <PasskeySettingsPage
        webAuthnMode={webAuthnMode}
        api={chatApi}
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
        busy={busy}
        error={error}
        onRegisterLogin={(opts) => onRegister(opts)}
        onRegisterSettlement={() => void enrollSettlementPasskey()}
        onRefreshAuthConfig={refreshAuthConfig}
        expectedOrigin={authConfig?.webauthn?.origin}
        rpId={authConfig?.webauthn?.rp_id}
      />
    ) : (
      children
    );

  return (
    <OperatorShell
      active={active}
      operatorLabel={operatorLabel}
      onSignOut={() => void onSignOut()}
      settingsHref={user ? "/settings/" : undefined}
      settingsActive={settingsPage}
      wireHref="/wire/"
      orgHref="/org/"
      secretaryHref="/secretary/"
      stewardHref="/steward/"
    >
      {loading ? (
        webAuthnMode ? (
          <PasskeyAuthLoadingShell />
        ) : (
          <div className="wallet-shell">
            <div className="wallet-page wallet-loading">認証を確認中…</div>
          </div>
        )
      ) : user ? (
        mainContent
      ) : (
        <div className="wallet-shell">
          <div className="wallet-page">
            <header className="wallet-topbar">
              <div className="wallet-brand">
                <span className="wallet-brand-mark" aria-hidden="true">
                  ¥
                </span>
                <div>
                  <h1 className="wallet-title">オペレーター認証</h1>
                  <p className="wallet-brand-sub">セッションが必要です</p>
                </div>
              </div>
            </header>

            {error && <p className="error-banner">{error}</p>}

            {authConfig?.dev_login_allowed !== false ? (
              <form className="wallet-panel" onSubmit={(e) => void onLogin(e)}>
                <section className="wallet-hero" aria-label="開発ログイン">
                  <label className="wallet-field">
                    <span>オペレーター</span>
                    <input
                      value={operatorId}
                      onChange={(ev) => setOperatorId(ev.target.value)}
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label className="wallet-field">
                    <span>開発用パスキー</span>
                    <input
                      type="password"
                      value={passkey}
                      onChange={(ev) => setPasskey(ev.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <button type="submit" className="primary-button" disabled={busy}>
                    {busy ? "確認中…" : "入る"}
                  </button>
                </section>
              </form>
            ) : (
              <p className="empty-copy">
                この画面では入れません。<a href="/wire/">Wire</a> から Touch ID で入ってください。
              </p>
            )}
          </div>
        </div>
      )}
    </OperatorShell>
  );
}
