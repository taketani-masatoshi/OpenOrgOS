import { PasskeyManagePanel, type PasskeyWebAuthnPolicy } from "./PasskeyManagePanel";
import type { PasskeyCredentialsApi } from "./passkey-credentials-client";
import { AppearancePanel } from "./AppearancePanel";

export type PasskeySettingsBackLink = {
  href: string;
  label: string;
};

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
  backLinks?: PasskeySettingsBackLink[];
};

const DEFAULT_BACK_LINKS: PasskeySettingsBackLink[] = [
  { href: "/", label: "予実に戻る" },
  { href: "/wire/", label: "Wire" },
  { href: "/chat-settings/", label: "チャット履歴" },
];

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
  backLinks = DEFAULT_BACK_LINKS,
}: PasskeySettingsPageProps) {
  if (!webAuthnMode) {
    return (
      <div className="passkey-settings-page">
        <header className="passkey-settings-header">
          <h1 className="passkey-settings-title">設定</h1>
          <p className="passkey-settings-lead">
            画面の外観を切り替えられます。この環境では WebAuthn が有効ではないため、PassKey
            の登録は開発ログインまたは本番 OIDC をご利用ください。
          </p>
        </header>
        <AppearancePanel />
        <p className="passkey-settings-back">
          {backLinks.map((link, i) => (
            <span key={link.href}>
              {i > 0 ? " · " : null}
              <a href={link.href}>{link.label}</a>
            </span>
          ))}
        </p>
      </div>
    );
  }

  return (
    <div className="passkey-settings-page">
      <header className="passkey-settings-header">
        <h1 className="passkey-settings-title">設定</h1>
        <p className="passkey-settings-lead">
          画面の外観と、ログイン用（Touch ID）・決済用（iPhone）の PassKey をこの端末で管理します。
        </p>
      </header>

      <AppearancePanel />

      <h2 className="passkey-settings-section-title">PassKey 管理</h2>

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
        {backLinks.map((link, i) => (
          <span key={link.href}>
            {i > 0 ? " · " : null}
            <a href={link.href}>{link.label}</a>
          </span>
        ))}
      </p>
    </div>
  );
}
