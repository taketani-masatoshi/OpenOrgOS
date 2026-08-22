/**
 * Shared unauthenticated PassKey screen — two-key model at a glance.
 */
import { useEffect, type FormEvent } from "react";
import { ensureWebAuthnPageOrigin, ensureWebAuthnRpHost } from "./webauthn-page-origin";

export type PasskeyAuthPanelProps = {
  operatorId: string;
  approverId: string;
  onOperatorId: (value: string) => void;
  onApproverId: (value: string) => void;
  showRegister: boolean;
  showSignIn: boolean;
  settlementReady?: boolean;
  busy: boolean;
  error: string | null;
  onRegister: () => void;
  onSignIn: () => void;
  /** Register settlement PassKey on this page (browser hybrid QR). */
  onSettlementRegister?: () => void;
  loginOrigin?: string;
  loginRpId?: string;
  /** When true, first login passkey requires Community SSO session before register API. */
  registrationRequiresSession?: boolean;
  communityHandoffUrl?: string;
};

export function PasskeyAuthPanel({
  operatorId,
  approverId,
  onOperatorId,
  onApproverId,
  showRegister,
  showSignIn,
  settlementReady = false,
  busy,
  error,
  onRegister,
  onSignIn,
  onSettlementRegister,
  loginOrigin,
  loginRpId,
  registrationRequiresSession = false,
  communityHandoffUrl,
}: PasskeyAuthPanelProps) {
  const ready = operatorId.trim().length > 0 && approverId.trim().length > 0;
  const firstRegister = showRegister && !showSignIn;
  const showIdFields =
    (firstRegister && !registrationRequiresSession) ||
    Boolean(onSettlementRegister && !settlementReady);
  const showLoginRegister = showRegister && !registrationRequiresSession;

  useEffect(() => {
    if (loginOrigin && ensureWebAuthnPageOrigin(loginOrigin)) return;
    if (loginRpId) ensureWebAuthnRpHost(loginRpId);
  }, [loginOrigin, loginRpId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (showSignIn) onSignIn();
    else if (showRegister && ready) onRegister();
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

      <section className="auth-hero" aria-labelledby="auth-title">
        <div className="auth-hero-inner">
          <h1 id="auth-title">この Mac で入る</h1>
          <p className="auth-lead">コンソールは Touch ID。高額の承認は iPhone の鍵です。</p>
        </div>
      </section>

      <main className="auth-main">
        <div className="auth-key-grid">
          <form className="auth-key-card" onSubmit={onSubmit}>
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
              {showSignIn ? (
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "確認中…" : "Touch ID で入る"}
                </button>
              ) : showLoginRegister ? (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !ready}
                >
                  {busy ? "登録中…" : "Touch ID で登録"}
                </button>
              ) : showRegister && registrationRequiresSession ? (
                <div className="auth-actions">
                  <p className="auth-hint">
                    初回は Community の Google ログインで入ってから、Touch ID を登録します。
                  </p>
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
                  disabled={busy || !ready}
                  onClick={onRegister}
                >
                  別の鍵を登録
                </button>
              ) : null}
            </div>
            {error ? <p className="auth-error">{error}</p> : null}
          </form>

          <article className="auth-key-card">
            <p className="auth-key-device">iPhone</p>
            <h2 className="auth-key-title">高額の承認</h2>
            <p className="auth-key-copy">
              ブラウザの QR を iPhone のカメラで読みます。Bluetooth をオンにしてください。
            </p>
            <p
              className={
                settlementReady ? "auth-key-status is-ready" : "auth-key-status is-pending"
              }
            >
              {settlementReady ? "登録済み" : "未登録"}
            </p>
            <div className="auth-actions">
              {settlementReady ? (
                <p className="auth-hint">ログイン後、高額承認のときに使います。</p>
              ) : (
                <p className="auth-hint">ログインしてから「iPhone で登録」を使います。</p>
              )}
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}
