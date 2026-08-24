import { PasskeyManagePanel, type PasskeyWebAuthnPolicy } from "./PasskeyManagePanel";
import type { PasskeyCredentialsApi } from "./passkey-credentials-client";

export type PasskeySettingsPageProps = {
  webAuthnMode: boolean;
  api: PasskeyCredentialsApi;
  operatorId: string;
  approverId: string;
  policy: PasskeyWebAuthnPolicy;
  busy?: boolean;
  error?: string | null;
  onRegisterLogin: (opts?: { bootstrap_token?: string }) => void | Promise<void>;
  onRegisterSettlement: () => void | Promise<void>;
  onRefreshAuthConfig?: () => void | Promise<void>;
  settlementRegistrationEnabled?: boolean;
  settlementRegistrationUrl?: string;
  expectedOrigin?: string;
  rpId?: string;
};

/**
 * Operator Console — PassKey 管理（一覧 · 登録 · 登録解除）
 */
export function PasskeySettingsPage({
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
  settlementRegistrationUrl,
  expectedOrigin,
  rpId,
}: PasskeySettingsPageProps) {
  if (!webAuthnMode) {
    return (
      <div className="passkey-settings-page">
        <header className="passkey-settings-header">
          <h1 className="passkey-settings-title">PassKey 管理</h1>
          <p className="passkey-settings-lead">
            この環境では WebAuthn が有効ではありません。開発ログインまたは本番 OIDC をご利用ください。
          </p>
        </header>
        <p className="passkey-settings-back">
          <a href="/">予実に戻る</a>
        </p>
      </div>
    );
  }

  return (
    <div className="passkey-settings-page">
      <header className="passkey-settings-header">
        <h1 className="passkey-settings-title">PassKey 管理</h1>
        <p className="passkey-settings-lead">
          ログイン用（Touch ID）と決済用（iPhone）の PassKey を登録・確認・登録解除できます。
        </p>
      </header>

      <PasskeyManagePanel
        webAuthnMode={webAuthnMode}
        api={api}
        operatorId={operatorId}
        approverId={approverId}
        policy={policy}
        busy={busy}
        error={error}
        onRegisterLogin={onRegisterLogin}
        onRegisterSettlement={onRegisterSettlement}
        onRefreshAuthConfig={onRefreshAuthConfig}
        settlementRegistrationEnabled={settlementRegistrationEnabled}
        settlementRegistrationUrl={settlementRegistrationUrl}
        expectedOrigin={expectedOrigin}
        rpId={rpId}
      />

      <p className="passkey-settings-back">
        <a href="/">予実に戻る</a>
        {" · "}
        <a href="/wire/">Wire</a>
      </p>
    </div>
  );
}
