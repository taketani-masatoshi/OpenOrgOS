/**
 * Shared unauthenticated PassKey screen — Mac login only.
 * Settlement PassKey is configured after login on /settings/.
 */
import { useLayoutEffect, useState, type FormEvent } from "react";
import { AUTH_COPY } from "./console-copy";
import { useCopy } from "./define-copy";
import { LocaleSync } from "./LocaleSync";
import { ThemeSync } from "./ThemeSync";
import { browserSupportsWebAuthn } from "./webauthn-simple";
import { buildCommunityConsoleStartUrl } from "./community-console-handoff";
import { inspectWebAuthnPage, type WebAuthnPageInspect } from "./webauthn-page-origin";
import { WEBAUTHN_COPY } from "./webauthn-copy";
import { webauthnUserMessage } from "./webauthn-user-error";

export type PasskeyAuthPanelProps = {
  operatorId: string;
  approverId: string;
  onOperatorId: (value: string) => void;
  onApproverId: (value: string) => void;
  showRegister: boolean;
  showSignIn: boolean;
  busy: boolean;
  error: string | null;
  onRegister: () => void;
  onSignIn: () => void;
  loginOrigin?: string;
  loginRpId?: string;
  /** When true, first login passkey requires Community SSO session before register API. */
  registrationRequiresSession?: boolean;
  communityHandoffUrl?: string;
  /** Path to PassKey settings after Community SSO (default /settings/). */
  settingsPath?: string;
  /** Settings deep-link: emphasize Community SSO + bootstrap steps before login. */
  emphasizeBootstrapFlow?: boolean;
};

function pageBanner(
  state: WebAuthnPageInspect,
  errors: (typeof WEBAUTHN_COPY)["ja"],
): string | null {
  if (state.status === "redirecting") {
    return errors.redirecting;
  }
  if (state.status === "unsupported_browser") {
    return errors.unsupportedPlease;
  }
  if (state.status === "origin_mismatch") {
    return webauthnUserMessage(new Error("webauthn origin mismatch"), {
      expectedOrigin: state.expectedOrigin,
      rpId: state.rpId,
    });
  }
  return null;
}

function initialPageState(
  loginOrigin?: string,
  loginRpId?: string,
): WebAuthnPageInspect {
  if (typeof window === "undefined") return { status: "ok" };
  return inspectWebAuthnPage({ expectedOrigin: loginOrigin, rpId: loginRpId });
}

export function PasskeyAuthPanel({
  operatorId,
  approverId,
  onOperatorId,
  onApproverId,
  showRegister,
  showSignIn,
  busy,
  error,
  onRegister,
  onSignIn,
  loginOrigin,
  loginRpId,
  registrationRequiresSession = false,
  communityHandoffUrl,
  settingsPath = "/settings/",
  emphasizeBootstrapFlow = false,
}: PasskeyAuthPanelProps) {
  const [pageState, setPageState] = useState<WebAuthnPageInspect>(() =>
    initialPageState(loginOrigin, loginRpId),
  );
  const copy = useCopy(AUTH_COPY);
  const errors = useCopy(WEBAUTHN_COPY);

  const communityStartUrl =
    communityHandoffUrl ?? buildCommunityConsoleStartUrl(settingsPath);

  const ready = operatorId.trim().length > 0 && approverId.trim().length > 0;
  const firstRegister = showRegister && !showSignIn;
  const showIdFields = firstRegister && !registrationRequiresSession;
  const showLoginRegister = showRegister && !registrationRequiresSession;
  const showHandoff =
    (showRegister && registrationRequiresSession) || emphasizeBootstrapFlow;
  const browserOk = typeof window === "undefined" ? true : browserSupportsWebAuthn();
  const pageBlocked = pageState.status !== "ok";
  const banner = pageBanner(pageState, errors);
  const hideForm = pageBlocked;

  useLayoutEffect(() => {
    setPageState(inspectWebAuthnPage({ expectedOrigin: loginOrigin, rpId: loginRpId }));
  }, [loginOrigin, loginRpId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || pageBlocked || !browserOk) return;
    if (showSignIn) onSignIn();
    else if (showRegister && ready && showLoginRegister) onRegister();
  }

  const settingsHref =
    typeof window !== "undefined"
      ? new URL(settingsPath, window.location.origin).pathname
      : settingsPath;

  const title = emphasizeBootstrapFlow ? copy.communityFirstTitle : copy.titleMac;
  const lead = emphasizeBootstrapFlow ? copy.communityFirstLead : copy.macLead;

  return (
    <div className="auth-page">
      <ThemeSync />
      <LocaleSync />
      <header className="auth-header">
        <div className="auth-header-inner">
          <a className="auth-brand" href="https://oorgos.org">
            OpenOrgOS
          </a>
        </div>
      </header>

      <section className="auth-hero" aria-labelledby="auth-title">
        <div className="auth-hero-inner">
          <h1 id="auth-title">{title}</h1>
          <p className="auth-lead">{lead}</p>
        </div>
      </section>

      <main className="auth-main">
        {banner ? <p className="auth-status-banner">{banner}</p> : null}

        {hideForm ? null : (
          <form className="auth-key-card auth-key-card-solo" onSubmit={onSubmit}>
            {!emphasizeBootstrapFlow ? (
              <>
                <p className="auth-key-device">{copy.thisMac}</p>
                <h2 className="auth-key-title">{copy.login}</h2>
                <p className="auth-key-copy">{copy.loginLead}</p>
                <p
                  className={
                    showSignIn ? "auth-key-status is-ready" : "auth-key-status is-pending"
                  }
                >
                  {showSignIn ? copy.loginStatusReady : copy.loginStatusPending}
                </p>
              </>
            ) : null}

            {showIdFields ? (
              <details className="auth-advanced" open={firstRegister || undefined}>
                <summary>{copy.operatorAndApprover}</summary>
                <label className="auth-field">
                  <span>{copy.operator}</span>
                  <input
                    value={operatorId}
                    onChange={(e) => onOperatorId(e.target.value)}
                    autoComplete="username"
                    placeholder="OP-001"
                  />
                </label>
                <label className="auth-field">
                  <span>{copy.approver}</span>
                  <input
                    value={approverId}
                    onChange={(e) => onApproverId(e.target.value)}
                    autoComplete="name"
                    placeholder={copy.displayNamePlaceholder}
                  />
                </label>
              </details>
            ) : null}

            <div className="auth-actions">
              {showHandoff ? (
                <div className="auth-handoff">
                  <p className="auth-hint">{copy.handoffHint}</p>
                  <ol className="auth-steps">
                    <li>
                      {communityStartUrl ? (
                        <a href={communityStartUrl}>{copy.communityGoogle}</a>
                      ) : (
                        copy.communityGoogle
                      )}
                    </li>
                    <li>
                      {copy.openPasskeySettingsBefore}
                      <a href={settingsHref}>{copy.openPasskeySettingsLink}</a>
                      {copy.openPasskeySettingsAfter}
                    </li>
                    <li>
                      {copy.bootstrapStep}
                      <span className="auth-steps-note">
                        （orgos operator passkey-bootstrap mint）
                      </span>
                    </li>
                  </ol>
                  {communityStartUrl ? (
                    <a className="btn btn-primary" href={communityStartUrl}>
                      {copy.communityEnter}
                    </a>
                  ) : null}
                </div>
              ) : showSignIn ? (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || pageBlocked || !browserOk}
                >
                  {busy ? copy.checkingBusy : copy.touchIdEnter}
                </button>
              ) : showLoginRegister ? (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || pageBlocked || !browserOk || !ready}
                >
                  {busy ? copy.registering : copy.touchIdRegister}
                </button>
              ) : (
                <p className="auth-hint">
                  {copy.noLoginKey}
                </p>
              )}
              {showSignIn && showLoginRegister ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || pageBlocked || !browserOk || !ready}
                  onClick={onRegister}
                >
                  {copy.registerAnother}
                </button>
              ) : null}
            </div>
            {error ? <p className="auth-error">{error}</p> : null}
          </form>
        )}
      </main>
    </div>
  );
}
