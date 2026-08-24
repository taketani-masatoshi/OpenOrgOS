import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPasskeyCredentials,
  formatPasskeyCreatedAt,
  passkeyDeviceLabel,
  revokePasskeyCredential,
  shortCredentialId,
  type PasskeyCredentialSummary,
  type PasskeyCredentialsApi,
} from "./passkey-credentials-client";
import { webauthnUserMessage } from "./webauthn-user-error";

export type PasskeyWebAuthnPolicy = {
  login_registration_bootstrap?: boolean;
  bootstrap_token_required?: boolean;
  registration_allowed?: boolean;
  settlement_registration_allowed?: boolean;
  additional_login_registration_allowed?: boolean;
  credential_count?: number;
  settlement_count?: number;
};

export type PasskeyManagePanelProps = {
  webAuthnMode: boolean;
  api: PasskeyCredentialsApi;
  operatorId: string;
  approverId: string;
  policy: PasskeyWebAuthnPolicy;
  busy?: boolean;
  /** Parent-supplied error string (already user-facing). */
  error?: string | null;
  onRegisterLogin: (opts?: { bootstrap_token?: string }) => void | Promise<void>;
  onRegisterSettlement: () => void | Promise<void>;
  onRefreshAuthConfig?: () => void | Promise<void>;
  /** When false, settlement registration is done elsewhere (e.g. Wire → Steward Chat). */
  settlementRegistrationEnabled?: boolean;
  /** Link shown when settlementRegistrationEnabled is false. */
  settlementRegistrationUrl?: string;
  expectedOrigin?: string;
  rpId?: string;
};

function purposeLabel(purpose: PasskeyCredentialSummary["purpose"]): string {
  return purpose === "login" ? "ログイン" : "決済";
}

type ActionKind = "idle" | "login" | "settlement" | "revoke";

export function PasskeyManagePanel({
  webAuthnMode,
  api,
  operatorId,
  approverId,
  policy,
  busy = false,
  error = null,
  onRegisterLogin,
  onRegisterSettlement,
  onRefreshAuthConfig,
  settlementRegistrationEnabled = true,
  settlementRegistrationUrl = "/steward/settings/",
  expectedOrigin,
  rpId,
}: PasskeyManagePanelProps) {
  const [credentials, setCredentials] = useState<PasskeyCredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<ActionKind>("idle");
  const [localError, setLocalError] = useState<string | null>(null);
  const [bootstrapToken, setBootstrapToken] = useState("");

  const running = busy || actionKind !== "idle";
  const userMsgOpts = { expectedOrigin, rpId };

  const refreshConfigRef = useRef(onRefreshAuthConfig);
  refreshConfigRef.current = onRefreshAuthConfig;

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      const rows = await fetchPasskeyCredentials(api);
      setCredentials(rows);
      await refreshConfigRef.current?.();
    } catch (e) {
      setListError(webauthnUserMessage(e, userMsgOpts));
    } finally {
      setLoading(false);
    }
  }, [api, expectedOrigin, rpId]);

  useEffect(() => {
    if (!webAuthnMode) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      setListError(null);
      try {
        const rows = await fetchPasskeyCredentials(api);
        if (cancelled) return;
        setCredentials(rows);
      } catch (e) {
        if (!cancelled) setListError(webauthnUserMessage(e, userMsgOpts));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [webAuthnMode, api, operatorId, expectedOrigin, rpId]);

  const loginCreds = credentials.filter((c) => c.purpose === "login");
  const settlementCreds = credentials.filter((c) => c.purpose === "settlement");

  const showLoginBootstrap = Boolean(
    policy.login_registration_bootstrap && loginCreds.length === 0,
  );
  const canAddLogin =
    showLoginBootstrap ||
    Boolean(policy.additional_login_registration_allowed && policy.registration_allowed);
  const canAddSettlement =
    settlementRegistrationEnabled && policy.settlement_registration_allowed !== false;
  const showBootstrapTokenField = Boolean(
    showLoginBootstrap && policy.bootstrap_token_required,
  );
  const loginRegisterReady =
    !showBootstrapTokenField || bootstrapToken.trim().length > 0;

  async function revoke(cred: PasskeyCredentialSummary) {
    if (!cred.revocable) return;
    const label = passkeyDeviceLabel(cred);
    const ok = window.confirm(
      `${label} の PassKey（${shortCredentialId(cred.credential_id)}）を登録解除しますか？`,
    );
    if (!ok) return;
    setActionKind("revoke");
    setLocalError(null);
    try {
      await revokePasskeyCredential(api, cred.credential_id);
      await refresh();
    } catch (e) {
      setLocalError(webauthnUserMessage(e, { ...userMsgOpts, purpose: "login" }));
    } finally {
      setActionKind("idle");
    }
  }

  async function registerLogin() {
    setActionKind("login");
    setLocalError(null);
    try {
      if (showBootstrapTokenField && !bootstrapToken.trim()) {
        throw new Error("bootstrap token required");
      }
      await onRegisterLogin(
        showBootstrapTokenField ? { bootstrap_token: bootstrapToken.trim() } : undefined,
      );
      setBootstrapToken("");
      await refresh();
    } catch (e) {
      setLocalError(webauthnUserMessage(e, { ...userMsgOpts, purpose: "login" }));
    } finally {
      setActionKind("idle");
    }
  }

  async function registerSettlement() {
    setActionKind("settlement");
    setLocalError(null);
    try {
      await onRegisterSettlement();
      await refresh();
    } catch (e) {
      setLocalError(webauthnUserMessage(e, { ...userMsgOpts, purpose: "settlement" }));
    } finally {
      setActionKind("idle");
    }
  }

  const displayError = localError ?? error ?? listError;

  if (!webAuthnMode) {
    return (
      <p className="passkey-settings-hint">
        この環境では WebAuthn が有効ではありません。
      </p>
    );
  }

  function loginButtonLabel(): string {
    if (actionKind === "login") return "Touch ID を確認中…";
    return showLoginBootstrap ? "Touch ID で登録" : "別の鍵を追加";
  }

  function settlementButtonLabel(): string {
    if (actionKind === "settlement") return "iPhone の QR を表示中…";
    return settlementCreds.length ? "別の iPhone で登録" : "iPhone で登録";
  }

  function renderCredentialTable(rows: PasskeyCredentialSummary[], emptyLabel: string) {
    if (loading) {
      return <p className="passkey-settings-muted">読み込み中…</p>;
    }
    if (rows.length === 0) {
      return <p className="passkey-settings-hint">{emptyLabel}</p>;
    }
    return (
      <div className="passkey-cred-table-wrap">
        <table className="passkey-cred-table">
          <thead>
            <tr>
              <th scope="col">種別</th>
              <th scope="col">端末</th>
              <th scope="col">登録日時</th>
              <th scope="col">ID</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cred) => (
              <tr key={cred.credential_id}>
                <td>{purposeLabel(cred.purpose)}</td>
                <td>{passkeyDeviceLabel(cred)}</td>
                <td>{formatPasskeyCreatedAt(cred.created_at)}</td>
                <td>
                  <code className="passkey-cred-id">{shortCredentialId(cred.credential_id)}</code>
                </td>
                <td>
                  {cred.revocable ? (
                    <button
                      type="button"
                      className="btn btn-ghost passkey-cred-revoke"
                      disabled={running}
                      onClick={() => void revoke(cred)}
                    >
                      {actionKind === "revoke" ? "解除中…" : "登録解除"}
                    </button>
                  ) : (
                    <span className="passkey-settings-muted">環境変数</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="passkey-manage-panel" data-busy={running ? "true" : undefined}>
      {displayError ? <p className="passkey-setup-error" role="alert">{displayError}</p> : null}

      <div className="passkey-settings-sections">
        <section className="passkey-settings-section" aria-labelledby="login-passkey-manage">
          <div className="passkey-settings-section-head">
            <div>
              <h2 id="login-passkey-manage" className="passkey-settings-section-title">
                ログイン PassKey
              </h2>
              <p className="passkey-settings-section-lead">
                Touch ID でコンソールに入る鍵です。Community SSO のあと登録します。
              </p>
            </div>
            {canAddLogin ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={running || !loginRegisterReady}
                onClick={() => void registerLogin()}
              >
                {loginButtonLabel()}
              </button>
            ) : null}
          </div>
          {showLoginBootstrap ? (
            <div className="passkey-bootstrap-guide">
              <p className="passkey-settings-hint">
                初回登録: CLI でトークンを発行 → 下欄に貼り付け → Touch ID で登録
              </p>
            </div>
          ) : null}
          {showBootstrapTokenField ? (
            <label className="auth-field passkey-bootstrap-field">
              <span>Bootstrap トークン</span>
              <input
                type="password"
                value={bootstrapToken}
                onChange={(e) => setBootstrapToken(e.target.value)}
                autoComplete="off"
                placeholder="pkb_…（orgos operator passkey-bootstrap mint）"
              />
            </label>
          ) : null}
          {renderCredentialTable(loginCreds, "ログイン用の PassKey はまだありません。")}
          {!canAddLogin && loginCreds.length > 0 ? (
            <p className="passkey-settings-hint">
              追加のログイン鍵は管理者が有効にしたときだけ登録できます。
            </p>
          ) : null}
        </section>

        <section className="passkey-settings-section" aria-labelledby="settlement-passkey-manage">
          <div className="passkey-settings-section-head">
            <div>
              <h2 id="settlement-passkey-manage" className="passkey-settings-section-title">
                決済 PassKey
              </h2>
              <p className="passkey-settings-section-lead">
                高額承認用です。ブラウザの QR を iPhone のカメラで読み、Bluetooth をオンにしてください。
              </p>
            </div>
            {canAddSettlement ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={running}
                onClick={() => void registerSettlement()}
              >
                {settlementButtonLabel()}
              </button>
            ) : null}
          </div>
          {!settlementRegistrationEnabled ? (
            <p className="passkey-settings-callout">
              決済 PassKey の登録は Steward Chat の設定から行ってください。
              {" "}
              <a href={settlementRegistrationUrl}>Steward Chat の PassKey 設定</a>
            </p>
          ) : null}
          {renderCredentialTable(settlementCreds, "決済 PassKey は未登録です。")}
          {settlementCreds.length > 0 ? (
            <p className="passkey-settings-hint">
              登録済みです。高額承認のとき、この Mac のブラウザが QR を表示します。
            </p>
          ) : canAddSettlement ? (
            <p className="passkey-settings-hint">
              登録中は Mac の Bluetooth をオンにし、iPhone を近くに置いてください。
            </p>
          ) : null}
        </section>
      </div>

      <p className="passkey-settings-meta">
        オペレーター: {operatorId} · 承認者: {approverId}
      </p>
    </div>
  );
}
