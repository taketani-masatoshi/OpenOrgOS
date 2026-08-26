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
import { AUTH_COPY, PASSKEY_COPY, SETTINGS_COPY } from "./console-copy";
import { useCopy } from "./define-copy";
import { webauthnUserMessage } from "./webauthn-user-error";
import { SettingsAccordionItem } from "./SettingsAccordionItem";
import { useUiLocale } from "./useUiLocale";
import { canRegisterLoginPasskey } from "./webauthn-issuance";

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

type ActionKind = "idle" | "login" | "settlement" | "revoke";

function credentialStatus(
  count: number,
  loading: boolean,
  copy: (typeof SETTINGS_COPY)["ja"],
  passkey: (typeof PASSKEY_COPY)["ja"],
): string {
  if (loading) return copy.loading;
  if (count === 0) return copy.none;
  return passkey.count(count);
}

export function PasskeyManagePanel({
  webAuthnMode,
  api,
  operatorId,
  policy,
  busy = false,
  error = null,
  onRegisterLogin,
  onRegisterSettlement,
  onRefreshAuthConfig,
  settlementRegistrationEnabled = true,
  settlementRegistrationUrl = "/settings/",
  expectedOrigin,
  rpId,
}: PasskeyManagePanelProps) {
  const [credentials, setCredentials] = useState<PasskeyCredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<ActionKind>("idle");
  const [localError, setLocalError] = useState<string | null>(null);
  const [bootstrapToken, setBootstrapToken] = useState("");
  const locale = useUiLocale();
  const settings = useCopy(SETTINGS_COPY);
  const copy = useCopy(PASSKEY_COPY);
  const auth = useCopy(AUTH_COPY);

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
  const canAddLogin = canRegisterLoginPasskey(policy, loginCreds.length);
  const canAddSettlement =
    settlementRegistrationEnabled && policy.settlement_registration_allowed !== false;
  const showBootstrapTokenField = Boolean(
    showLoginBootstrap && policy.bootstrap_token_required,
  );
  const loginRegisterReady =
    !showBootstrapTokenField || bootstrapToken.trim().length > 0;

  async function revoke(cred: PasskeyCredentialSummary) {
    if (!cred.revocable) return;
    const label = passkeyDeviceLabel(cred, locale);
    const ok = window.confirm(copy.confirmRevoke(label, shortCredentialId(cred.credential_id)));
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
    return <p className="passkey-settings-hint">{settings.webauthnDisabled}</p>;
  }

  function loginButtonLabel(): string {
    if (actionKind === "login") return copy.checkingTouchId;
    return showLoginBootstrap ? auth.touchIdRegister : copy.addAnotherKey;
  }

  function settlementButtonLabel(): string {
    if (actionKind === "settlement") return copy.showingIphoneQr;
    return settlementCreds.length ? copy.registerAnotherIphone : copy.registerIphone;
  }

  function renderCredentialTable(rows: PasskeyCredentialSummary[], emptyLabel: string) {
    if (loading) {
      return <p className="passkey-settings-muted">{settings.loadingEllipsis}</p>;
    }
    if (rows.length === 0) {
      return <p className="passkey-settings-hint">{emptyLabel}</p>;
    }
    return (
      <div className="passkey-cred-table-wrap">
        <table className="passkey-cred-table">
          <thead>
            <tr>
              <th scope="col">{copy.colKind}</th>
              <th scope="col">{copy.colDevice}</th>
              <th scope="col">{copy.colRegistered}</th>
              <th scope="col">{copy.colId}</th>
              <th scope="col">{copy.colAction}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cred) => (
              <tr key={cred.credential_id}>
                <td>
                  {cred.purpose === "login" ? copy.purposeLogin : copy.purposeSettlement}
                </td>
                <td>{passkeyDeviceLabel(cred, locale)}</td>
                <td>{formatPasskeyCreatedAt(cred.created_at, locale)}</td>
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
                      {actionKind === "revoke" ? copy.revoking : copy.revoke}
                    </button>
                  ) : (
                    <span className="passkey-settings-muted">{copy.managedByEnv}</span>
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

      <SettingsAccordionItem
        id="login-passkey"
        title={settings.loginPasskey}
        status={credentialStatus(loginCreds.length, loading, settings, copy)}
      >
        <p className="passkey-settings-section-lead">{copy.loginLead}</p>
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
        {showLoginBootstrap ? (
          <div className="passkey-bootstrap-guide">
            <p className="passkey-settings-hint">{copy.bootstrapHint}</p>
          </div>
        ) : null}
        {showBootstrapTokenField ? (
          <label className="auth-field passkey-bootstrap-field">
            <span>{copy.bootstrapToken}</span>
            <input
              type="password"
              value={bootstrapToken}
              onChange={(e) => setBootstrapToken(e.target.value)}
              autoComplete="off"
              placeholder="pkb_…（orgos operator passkey-bootstrap mint）"
            />
          </label>
        ) : null}
        {renderCredentialTable(loginCreds, copy.emptyLogin)}
        {!canAddLogin && loginCreds.length > 0 ? (
          <p className="passkey-settings-hint">{copy.extraLoginHint}</p>
        ) : null}
      </SettingsAccordionItem>

      <SettingsAccordionItem
        id="settlement-passkey"
        title={settings.settlementPasskey}
        status={credentialStatus(settlementCreds.length, loading, settings, copy)}
      >
        <p className="passkey-settings-section-lead">{copy.settlementLead}</p>
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
        {!settlementRegistrationEnabled ? (
            <p className="passkey-settings-callout">
              {copy.settlementCallout}{" "}
              <a href={settlementRegistrationUrl}>{copy.settlementCalloutLink}</a>
            </p>
        ) : null}
        {renderCredentialTable(settlementCreds, copy.emptySettlement)}
        {settlementCreds.length > 0 ? (
          <p className="passkey-settings-hint">{copy.settlementRegistered}</p>
        ) : canAddSettlement ? (
          <p className="passkey-settings-hint">{copy.settlementHint}</p>
        ) : null}
      </SettingsAccordionItem>
    </div>
  );
}
