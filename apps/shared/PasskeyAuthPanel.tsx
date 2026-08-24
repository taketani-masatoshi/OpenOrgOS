/**
 * Shared unauthenticated PassKey screen — Mac login only.
 * Settlement PassKey is configured after login on /settings/.
 */
import { useLayoutEffect, useState, type FormEvent } from "react";
import { browserSupportsWebAuthn } from "./webauthn-simple";
import { buildCommunityConsoleStartUrl } from "./community-console-handoff";
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
  /** When true, first login passkey requires Community SSO session before register API. */
  registrationRequiresSession?: boolean;
  communityHandoffUrl?: string;
  /** Path to PassKey settings after Community SSO (default /settings/). */
  settingsPath?: string;
  /** Settings deep-link: emphasize Community SSO + bootstrap steps before login. */
  emphasizeBootstrapFlow?: boolean;
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
  const banner = pageBanner(pageState);
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

  const title = emphasizeBootstrapFlow ? "PassKey 設定の前に Community でログイン" : "この Mac で入る";
  const lead = emphasizeBootstrapFlow
    ? "Community で SSO ログインしたあと、このページで Touch ID 用 PassKey を登録します。"
    : "Touch ID でコンソールに入ります。決済 PassKey はログイン後、設定から登録します。";

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
                <p className="auth-key-device">この Mac</p>
                <h2 className="auth-key-title">ログイン</h2>
                <p className="auth-key-copy">Touch ID でコンソールに入ります。</p>
                <p
                  className={
                    showSignIn ? "auth-key-status is-ready" : "auth-key-status is-pending"
                  }
                >
                  {showSignIn ? "使える" : "まだ"}
                </p>
              </>
            ) : null}

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

            <div className="auth-actions">
              {showHandoff ? (
                <div className="auth-handoff">
                  <p className="auth-hint">
                    初回登録は Community でログインしたあと、PassKey 設定から行います。
                  </p>
                  <ol className="auth-steps">
                    <li>
                      {communityStartUrl ? (
                        <a href={communityStartUrl}>Community で Google ログイン</a>
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
                  {communityStartUrl ? (
                    <a className="btn btn-primary" href={communityStartUrl}>
                      Community で入る
                    </a>
                  ) : null}
                </div>
              ) : showSignIn ? (
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
        )}
      </main>
    </div>
  );
}
