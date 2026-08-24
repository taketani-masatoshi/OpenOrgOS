/**
 * Shared unauthenticated PassKey screen — Mac login only.
 * Settlement PassKey is configured after login on /settings/.
 */
import { useEffect, useState, type FormEvent } from "react";
import { browserSupportsWebAuthn } from "./webauthn-simple";
import { inspectWebAuthnPage, type WebAuthnPageInspect } from "./webauthn-page-origin";
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
  /** When true, first login passkey requires CLI-minted bootstrap token (production). */
  bootstrapTokenRequired?: boolean;
  bootstrapToken?: string;
  onBootstrapToken?: (value: string) => void;
  /** When true, first login passkey requires Community SSO session before register API. */
  registrationRequiresSession?: boolean;
  communityHandoffUrl?: string;
  /** Path to PassKey settings after Community SSO (default /settings/). */
  settingsPath?: string;
};

function pageBanner(state: WebAuthnPageInspect): string | null {
  if (state.status === "redirecting") {
    return "正しい URL に移動しています…";
  }
  if (state.status === "unsupported_browser") {
    return "このブラウザでは PassKey を使えません。Chrome または Safari をご利用ください";
  }
  if (state.status === "origin_mismatch") {
    return webauthnUserMessage(new Error("webauthn origin mismatch"), {
      expectedOrigin: state.expectedOrigin,
      rpId: state.rpId,
    });
  }
  return null;
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
  bootstrapTokenRequired = false,
  bootstrapToken = "",
  onBootstrapToken,
  communityHandoffUrl,
  settingsPath = "/settings/",
}: PasskeyAuthPanelProps) {
  const [pageState, setPageState] = useState<WebAuthnPageInspect>({ status: "ok" });

  const ready =
    operatorId.trim().length > 0 &&
    approverId.trim().length > 0 &&
    (!bootstrapTokenRequired || bootstrapToken.trim().length > 0);
  const firstRegister = showRegister && !showSignIn;
  const showIdFields = firstRegister && !registrationRequiresSession;
  const showLoginRegister = showRegister && !registrationRequiresSession;
  const browserOk = typeof window === "undefined" ? true : browserSupportsWebAuthn();
  const pageBlocked = pageState.status !== "ok";
  const banner = pageBanner(pageState);

  useEffect(() => {
    setPageState(
      inspectWebAuthnPage({ expectedOrigin: loginOrigin, rpId: loginRpId }),
    );
  }, [loginOrigin, loginRpId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || pageBlocked || !browserOk) return;
    if (showSignIn) onSignIn();
    else if (showRegister && ready) onRegister();
  }

  const settingsHref =
    typeof window !== "undefined"
      ? new URL(settingsPath, window.location.origin).pathname
      : settingsPath;

  return (
    <div className="auth-page">
      <header className="auth-header">
        <div className="auth-header-inner">
          <a className="auth-brand" href="https://oorgos.org">
            OpenOrgOS
          </a>
        </div>
      </header>

      <section className="auth-hero" aria-labelledby="auth-title">
        <div className="auth-hero-inner">
          <h1 id="auth-title">この Mac で入る</h1>
          <p className="auth-lead">
            Touch ID でコンソールに入ります。決済 PassKey はログイン後、設定から登録します。
          </p>
        </div>
      </section>

      <main className="auth-main">
        {banner ? <p className="auth-status-banner">{banner}</p> : null}

        <form className="auth-key-card auth-key-card-solo" onSubmit={onSubmit}>
          <p className="auth-key-device">この Mac</p>
          <h2 className="auth-key-title">ログイン</h2>
          <p className="auth-key-copy">Touch ID でコンソールに入ります。</p>
          <p
            className={showSignIn ? "auth-key-status is-ready" : "auth-key-status is-pending"}
          >
            {showSignIn ? "使える" : "まだ"}
          </p>

          {showIdFields ? (
            <details className="auth-advanced" open={firstRegister || undefined}>
              <summary>オペレーターと承認者</summary>
              <label className="auth-field">
                <span>オペレーター</span>
                <input
                  value={operatorId}
                  onChange={(e) => onOperatorId(e.target.value)}
                  autoComplete="username"
                  placeholder="OP-001"
                />
              </label>
              <label className="auth-field">
                <span>承認者</span>
                <input
                  value={approverId}
                  onChange={(e) => onApproverId(e.target.value)}
                  autoComplete="name"
                  placeholder="表示名"
                />
              </label>
            </details>
          ) : null}

          {showLoginRegister && bootstrapTokenRequired ? (
            <label className="auth-field">
              <span>Bootstrap トークン</span>
              <input
                type="password"
                value={bootstrapToken}
                onChange={(e) => onBootstrapToken?.(e.target.value)}
                autoComplete="off"
                placeholder="pkb_…"
              />
            </label>
          ) : null}

          <div className="auth-actions">
            {showSignIn ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || pageBlocked || !browserOk}
              >
                {busy ? "確認中…" : "Touch ID で入る"}
              </button>
            ) : showLoginRegister ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || pageBlocked || !browserOk || !ready}
              >
                {busy ? "登録中…" : "Touch ID で登録"}
              </button>
            ) : showRegister && registrationRequiresSession ? (
              <div className="auth-handoff">
                <p className="auth-hint">
                  初回登録は Community でログインしたあと、PassKey 設定から行います。
                </p>
                <ol className="auth-steps">
                  <li>
                    {communityHandoffUrl ? (
                      <>
                        <a href={communityHandoffUrl}>Community で Google ログイン</a>
                      </>
                    ) : (
                      "Community で Google ログイン"
                    )}
                  </li>
                  <li>
                    このコンソールの <a href={settingsHref}>PassKey 設定</a> を開く
                  </li>
                  <li>
                    CLI で発行した bootstrap トークンを入力し、Touch ID で登録
                    <span className="auth-steps-note">
                      （orgos operator passkey-bootstrap mint）
                    </span>
                  </li>
                </ol>
                {communityHandoffUrl ? (
                  <a className="btn btn-primary" href={communityHandoffUrl}>
                    Community で入る
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="auth-hint">
                ログイン用の鍵がまだありません。管理者に登録の許可を依頼してください。
              </p>
            )}
            {showSignIn && showLoginRegister ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || pageBlocked || !browserOk || !ready}
                onClick={onRegister}
              >
                別の鍵を登録
              </button>
            ) : null}
          </div>
          {error ? <p className="auth-error">{error}</p> : null}
        </form>
      </main>
    </div>
  );
}
