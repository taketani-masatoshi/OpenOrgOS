import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AUTH_COPY, SHELL_COPY } from "@ops-shared/console-copy";
import { useCopy } from "@ops-shared/define-copy";
import { OperatorShell, type OperatorShellActive } from "@ops-shared/OperatorShell";
import { formatOperatorSessionLabel } from "@ops-shared/formatOperatorSessionLabel";
import { useUiLocale } from "@ops-shared/useUiLocale";
import { buildCommunityConsoleStartUrl } from "@ops-shared/community-console-handoff";
import { PasskeyAuthPanel } from "@ops-shared/PasskeyAuthPanel";
import { PasskeySettingsPage } from "@ops-shared/PasskeySettingsPage";
import { registerSettlementPasskey } from "@ops-shared/register-settlement-passkey";
import { isPasskeySettingsPath as pathIsPasskeySettings } from "@ops-shared/console-hrefs";
import { canSignInWithPasskey, isWebAuthnIssuanceEnabled } from "@ops-shared/webauthn-issuance";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import {
  chatApi,
  fetchAuthConfig,
  fetchCustomersNav,
  fetchMe,
  loginDev,
  logoutChat,
  type AuthConfig,
  type AuthUser,
} from "./api";
import { ClaimDeskPage } from "./ClaimDeskPage";
import { loginWithWebAuthn } from "./webauthn-login";
import { registerWithWebAuthn } from "./webauthn-register";

function isPasskeySettingsPath(): boolean {
  return pathIsPasskeySettings(window.location.pathname);
}

function PasskeyAuthLoadingShell() {
  const copy = useCopy(AUTH_COPY);
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
          <h1>{copy.titleMac}</h1>
          <p className="auth-lead">{copy.loading}</p>
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
  active,
}: {
  children: ReactNode;
  active?: OperatorShellActive;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passkey, setPasskey] = useState("orgos-dev");
  const [operatorId, setOperatorId] = useState("OP-001");
  const [approverId, setApproverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [customersNav, setCustomersNav] = useState(false);
  const locale = useUiLocale();
  const copy = useCopy(AUTH_COPY);
  const shell = useCopy(SHELL_COPY);

  const webAuthnLoginMode =
    authConfig?.mode === "prod" && authConfig.prod_adapter === "webauthn";
  const webAuthnIssuance = isWebAuthnIssuanceEnabled(authConfig);

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
        const [me, config, customers] = await Promise.all([
          fetchMe().catch(() => null),
          fetchAuthConfig().catch(() => null),
          fetchCustomersNav().catch(() => ({ show_tab: false })),
        ]);
        if (cancelled) return;
        if (config) {
          setAuthConfig(config);
          if (config.login_defaults) {
            setOperatorId(config.login_defaults.operator_id);
            setApproverId(config.login_defaults.approver_id);
          }
        }
        setCustomersNav(customers.show_tab === true);
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

  useEffect(() => {
    const d = authConfig?.login_defaults;
    if (!d) return;
    setOperatorId((prev) => (prev === "OP-001" || prev === "" ? d.operator_id : prev));
    setApproverId((prev) => (prev === "Demo CEO" || prev === "" ? d.approver_id : prev));
  }, [authConfig]);

  async function refreshAfterAuth() {
    const me = await fetchMe();
    if (!me) {
      throw new Error(copy.sessionPersistFailed);
    }
    setUser(me);
    await refreshAuthConfig();
    const customers = await fetchCustomersNav().catch(() => ({ show_tab: false }));
    setCustomersNav(customers.show_tab === true);
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginDev({
        passkey,
        operator_id: operatorId.trim() || "OP-001",
        approver_id: approverId.trim() || operatorId.trim() || "OP-001",
      });
      await refreshAfterAuth();
    } catch (err) {
      setUser(null);
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
    await refreshAuthConfig();
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

  if (loading) {
    return <PasskeyAuthLoadingShell />;
  }

  if (!user && webAuthnLoginMode) {
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
            ? buildCommunityConsoleStartUrl(settingsPage ? "/settings/" : "/")
            : undefined
        }
        settingsPath="/settings/"
        emphasizeBootstrapFlow={emphasizeBootstrapFlow}
        communityHandoffPrimary={Boolean(authConfig?.community_handoff)}
        allowPasswordLogin={authConfig?.dev_login_allowed === true}
        password={passkey}
        onPassword={setPasskey}
        onPasswordLogin={() => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              await loginDev({
                passkey,
                operator_id: operatorId.trim() || "OP-001",
                approver_id: approverId.trim() || operatorId.trim() || "OP-001",
              });
              await refreshAfterAuth();
            } catch (err) {
              setUser(null);
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    );
  }

  // Employee seat: the claim desk replaces the console, whatever the URL says.
  if (user?.claim_only && !settingsPage) {
    return <ClaimDeskPage onSignOut={() => void onSignOut()} />;
  }

  const operatorLabel = user
    ? formatOperatorSessionLabel(user, locale)
    : loading
      ? shell.checkingAuth
      : shell.signedOut;

  const mainContent =
    settingsPage && user ? (
      <PasskeySettingsPage
        webAuthnMode={webAuthnIssuance}
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
      executiveHref="/"
      ledgerHref="/?ledger=1"
      yojitsuHref="/?wallet=1"
      torihikiHref="/?receipt-issue=1"
      wireHref="/wire/"
      orgHref="/org/"
      approvalsHref="/approvals/"
      customersHref={customersNav ? "/customers/outbound/" : null}
      runsHref="/runs/"
      secretaryHref="/secretary/"
      stewardHref="/steward/"
    >
      {loading ? (
        webAuthnLoginMode ? (
          <PasskeyAuthLoadingShell />
        ) : (
          <div className="wallet-shell">
            <div className="wallet-page wallet-loading">{copy.checking}</div>
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
                  <h1 className="wallet-title">{copy.titleSession}</h1>
                  <p className="wallet-brand-sub">{copy.sessionNeeded}</p>
                </div>
              </div>
            </header>

            {error && <p className="error-banner">{error}</p>}

            {canSignInWithPasskey(authConfig) ? (
              <section className="wallet-panel" aria-label={copy.passkeyLoginLabel}>
                <div className="wallet-hero">
                  <p className="wallet-brand-sub">{copy.leadPasskeyOnly}</p>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void onSignIn()}
                  >
                    {busy ? copy.checkingBusy : copy.touchIdEnter}
                  </button>
                </div>
              </section>
            ) : null}

            {authConfig?.dev_login_allowed !== false ? (
              <form id="orgos-dev-login" className="wallet-panel" onSubmit={(e) => void onLogin(e)}>
                <section className="wallet-hero" aria-label={copy.devLoginLabel}>
                  {canSignInWithPasskey(authConfig) ? (
                    <p className="wallet-brand-sub">{copy.orPassword}</p>
                  ) : null}
                  <label className="wallet-field">
                    <span>{copy.operator}</span>
                    <input
                      id="orgos-login-operator"
                      name="operator_id"
                      value={operatorId}
                      onChange={(ev) => setOperatorId(ev.target.value)}
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label className="wallet-field">
                    <span>{copy.password}</span>
                    <input
                      id="orgos-login-password"
                      name="password"
                      type="password"
                      value={passkey}
                      onChange={(ev) => setPasskey(ev.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <button id="orgos-login-submit" type="submit" className="primary-button" disabled={busy}>
                    {busy ? copy.checkingBusy : copy.enter}
                  </button>
                </section>
              </form>
            ) : (
              <p className="empty-copy">
                {copy.useWireInstead}
                <a href="/wire/">{copy.useWireLink}</a>
                {copy.useWireAfter}
              </p>
            )}
          </div>
        </div>
      )}
    </OperatorShell>
  );
}
