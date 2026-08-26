import { PasskeyManagePanel, type PasskeyWebAuthnPolicy } from "./PasskeyManagePanel";
import type { PasskeyCredentialsApi } from "./passkey-credentials-client";
import { AppearancePanel } from "./AppearancePanel";
import { LanguagePanel } from "./LanguagePanel";
import { SettingsAccordionItem } from "./SettingsAccordionItem";
import { SettingsAccordionList } from "./SettingsAccordionList";
import { SETTINGS_COPY } from "./console-copy";
import { useCopy } from "./define-copy";

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
 * Operator Console — 設定（折りたたみ一覧）
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
  const copy = useCopy(SETTINGS_COPY);

  return (
    <div className="passkey-settings-page">
      <header className="passkey-settings-header">
        <h1 className="passkey-settings-title">{copy.title}</h1>
      </header>

      <SettingsAccordionList>
        <SettingsAccordionItem id="company-setup" title={copy.companySetup}>
          <p className="passkey-settings-hint">{copy.companySetupLead}</p>
          <p className="passkey-settings-actions">
            <a className="primary-button" href="/?onboarding=1">
              {copy.companySetupOpen}
            </a>
          </p>
        </SettingsAccordionItem>
        <SettingsAccordionItem id="account-admin" title={copy.accountAdmin}>
          <p className="passkey-settings-hint">{copy.accountAdminLead}</p>
          <p className="passkey-settings-actions">
            <a className="primary-button" href="/?account=1">
              {copy.accountAdminOpen}
            </a>
          </p>
        </SettingsAccordionItem>
        <LanguagePanel />
        <AppearancePanel />
        {webAuthnMode ? (
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
        ) : (
          <>
            <SettingsAccordionItem
              id="login-passkey"
              title={copy.loginPasskey}
              status={copy.off}
            >
              <p className="passkey-settings-hint">{copy.webauthnOffHere}</p>
            </SettingsAccordionItem>
            <SettingsAccordionItem
              id="settlement-passkey"
              title={copy.settlementPasskey}
              status={copy.off}
            >
              <p className="passkey-settings-hint">{copy.settlementOffHere}</p>
            </SettingsAccordionItem>
          </>
        )}
      </SettingsAccordionList>
    </div>
  );
}
