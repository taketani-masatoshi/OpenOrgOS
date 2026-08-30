import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  chatApi,
  fetchAuthConfig,
  fetchMe,
  fetchGmailStatus,
  fetchProductOnboarding,
  postGmailConnect,
  postGmailDisconnect,
  postLedgerSource,
  postProductOnboardingSetup,
  putMailConfig,
  putMailSecrets,
  type MailSecretsSnapshot,
  type OnboardingReport,
  type TenantMailStatus,
} from "./api";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";
import { registerWithWebAuthn } from "./webauthn-register";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";

export function OnboardingPage() {
  const copy = useCopy(STEWARD_COPY);
  const [report, setReport] = useState<OnboardingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [fiscalMonth, setFiscalMonth] = useState("3");
  const [representative, setRepresentative] = useState("");
  const [busy, setBusy] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [mail, setMail] = useState<TenantMailStatus | null>(null);
  const [mailFromName, setMailFromName] = useState("");
  const [mailFromEmail, setMailFromEmail] = useState("");
  const [mailProvider, setMailProvider] = useState<TenantMailStatus["provider"]>("dry_run");
  const [mailConnectUrl, setMailConnectUrl] = useState<string | null>(null);
  const [mailNote, setMailNote] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<MailSecretsSnapshot | null>(null);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapUser, setImapUser] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [firstJeMonth, setFirstJeMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const setupReason =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("setup") === "required";

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchProductOnboarding();
      setReport(next);
      if (next.company_name) setCompanyName(next.company_name);
      if (next.representative) setRepresentative(next.representative);
      if (next.fiscal_year_end_month) {
        setFiscalMonth(String(next.fiscal_year_end_month));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadMail = useCallback(async () => {
    const status = await fetchGmailStatus().catch(() => null);
    if (!status) return;
    setMail(status);
    if (status.secrets) setSecrets(status.secrets);
    setMailFromName(status.from.name);
    setMailFromEmail(status.from.email);
    setMailProvider(status.provider);
  }, []);

  useEffect(() => {
    void load();
    void loadMail();
  }, [load, loadMail]);

  useEffect(() => {
    void fetchAuthConfig()
      .then((cfg) => {
        setBootstrapRequired(Boolean(cfg.webauthn?.bootstrap_token_required));
      })
      .catch(() => undefined);
  }, []);

  async function saveSetup() {
    setBusy(true);
    setError(null);
    try {
      await postProductOnboardingSetup({
        company_name: companyName || undefined,
        fiscal_year_end_month: Number.parseInt(fiscalMonth, 10),
        representative: representative || undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveMailConfig() {
    setBusy(true);
    setError(null);
    setMailNote(null);
    try {
      const next = await putMailConfig({
        from: { name: mailFromName, email: mailFromEmail },
        provider: mailProvider,
      });
      setMail(next);
      setMailNote(copy.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveMailSecrets() {
    setBusy(true);
    setError(null);
    setMailNote(null);
    try {
      const next = await putMailSecrets({
        ...(smtpUser.trim() ? { ORGOS_SMTP_USER: smtpUser.trim() } : {}),
        ...(smtpPassword ? { ORGOS_SMTP_PASSWORD: smtpPassword } : {}),
        ...(imapUser.trim() ? { ORGOS_IMAP_USER: imapUser.trim() } : {}),
        ...(imapPassword ? { ORGOS_IMAP_PASSWORD: imapPassword } : {}),
        ...(imapHost.trim() ? { ORGOS_IMAP_HOST: imapHost.trim() } : {}),
      });
      setSecrets(next.secrets);
      setSmtpPassword("");
      setImapPassword("");
      setMailNote(copy.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function connectMail() {
    setBusy(true);
    setError(null);
    setMailNote(null);
    try {
      const result = await postGmailConnect();
      setMailConnectUrl(result.connect_url);
      if (!result.platform_ready) setMailNote(result.platform_detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnectMail() {
    setBusy(true);
    setError(null);
    setMailNote(null);
    try {
      const next = await postGmailDisconnect();
      setMail(next);
      setMailProvider(next.provider);
      setMailConnectUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function registerPasskeyInline() {
    setBusy(true);
    setError(null);
    setPasskeyMsg(null);
    try {
      const me = await fetchMe();
      if (!me?.operator_id) {
        throw new Error("ログインセッションが必要です");
      }
      await registerWithWebAuthn(chatApi, {
        operator_id: me.operator_id,
        approver_id: me.approver_id ?? me.operator_id,
        bootstrap_token: bootstrapToken.trim() || undefined,
      });
      setPasskeyMsg("Passkey を登録しました。");
      await load();
    } catch (e) {
      setError(webauthnUserMessage(e, { purpose: "login" }));
    } finally {
      setBusy(false);
    }
  }

  async function postFirstJournal() {
    if (!companyName.trim()) {
      setError("先に会社名を入力して保存してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!report?.steps.find((s) => s.id === "company")?.complete) {
        await postProductOnboardingSetup({
          company_name: companyName || undefined,
          fiscal_year_end_month: Number.parseInt(fiscalMonth, 10),
          representative: representative || undefined,
        });
      }
      await postLedgerSource({ source: "onboarding-first", month: firstJeMonth });
      const updated = await fetchProductOnboarding();
      setReport(updated);
      if (updated.customer_ready) {
        window.location.href = "/?ledger=1";
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const passkeyDone = report?.steps.find((s) => s.id === "passkey")?.complete;
  const firstJeDone = report?.steps.find((s) => s.id === "first-je")?.complete;
  const companyDone = report?.steps.find((s) => s.id === "company")?.complete;
  const customerReady = report?.customer_ready ?? false;
  const recommended = (report?.steps ?? []).filter((s) =>
    ["passkey", "dencho", "validate"].includes(s.id),
  );

  return (
    <OpsPage
      title={copy.onboarding}
      lead={`${copy.onboardingLead} ${
        customerReady ? `（${copy.onboardingReady}）` : `（${copy.onboardingNotReady}）`
      }`}
      loading={!report}
      loadingLabel={copy.loading}
      error={error}
      className="onboarding-page"
    >
      {setupReason && (
        <p className="error-banner">
          セットアップ未完了のためワークベンチを開けません。会社情報と初回仕訳を完了してください。
        </p>
      )}
      <section className="ops-card">
        <h2 className="section-title">OpenOrgOS の課金（プラットフォーム）</h2>
        <p className="ops-page-meta">
          OpenOrgOS 利用料の Stripe キーは初期設定画面で登録します（test キー可）。会社の会計・帳簿とは別です。
        </p>
        <p className="section-cta">
          <a className="btn btn-primary btn-sm" href="/?product-setup=1">
            初期設定を開く
          </a>
        </p>
      </section>

      <section className="ops-card">
        <h2 className="section-title">会社情報</h2>
        <p className="ops-page-meta">
          電子帳簿は基本要件（検索・訂正削除履歴）に対応。優良要件（タイムスタンプ局等）は別オプションです。
        </p>
        <label className="wallet-field">
          会社名
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <label className="wallet-field">
          決算月
          <input
            type="number"
            min={1}
            max={12}
            value={fiscalMonth}
            onChange={(e) => setFiscalMonth(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          代表者
          <input
            value={representative}
            onChange={(e) => setRepresentative(e.target.value)}
          />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void saveSetup()}
          >
            保存
          </button>
        </div>
      </section>

      <section className="ops-card">
        <h2 className="section-title">外部サービス連携</h2>
        <p className="ops-page-meta">
          Slack · Asana · Google Drive の接続と送信先は連携設定にまとめています。
        </p>
        <p className="section-cta">
          <a className="btn btn-primary btn-sm" href="/?integrations=1">
            連携設定を開く
          </a>
        </p>
      </section>

      <section className="ops-card mail-card">
        <h2 className="section-title">{copy.mailSection}</h2>
        <p className="ops-page-meta">
          {mail?.connected
            ? copy.mailConnected(mail.email ?? "")
            : copy.mailNotConnected}
          {mail?.expired ? ` — ${copy.mailExpired}` : ""}
        </p>
        <p className="ops-page-meta">{copy.mailSecretsNote}</p>
        <label className="wallet-field">
          {copy.mailFromName}
          <input value={mailFromName} onChange={(e) => setMailFromName(e.target.value)} />
        </label>
        <label className="wallet-field">
          {copy.mailFromEmail}
          <input
            type="email"
            value={mailFromEmail}
            onChange={(e) => setMailFromEmail(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          {copy.mailProvider}
          <select
            value={mailProvider}
            onChange={(e) => setMailProvider(e.target.value as TenantMailStatus["provider"])}
          >
            <option value="gmail_api">gmail_api</option>
            <option value="smtp">smtp</option>
            <option value="dry_run">dry_run</option>
          </select>
        </label>
        {mail?.smtp && (
          <p className="ops-page-meta">
            {copy.mailSmtpHost}: {mail.smtp.host} · {copy.mailSmtpPort}: {mail.smtp.port}
          </p>
        )}
        {mailNote && <p className="ops-page-meta">{mailNote}</p>}
        {mail && !mail.platform_ready && (
          <p className="ops-page-meta">{mail.platform_detail}</p>
        )}
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void saveMailConfig()}
          >
            {copy.save}
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() => void connectMail()}
          >
            {copy.mailConnect}
          </button>
          {mail?.connected && (
            <button
              type="button"
              className="quiet-button"
              disabled={busy}
              onClick={() => void disconnectMail()}
            >
              {copy.mailDisconnect}
            </button>
          )}
        </div>
        {mailConnectUrl && (
          <p className="section-cta">
            <a className="btn btn-primary btn-sm" href={mailConnectUrl}>
              {copy.mailConnectOpen}
            </a>
          </p>
        )}

        <h3 className="section-title">{copy.mailSecretsTitle}</h3>
        <p className="ops-page-meta">{copy.mailSecretsStored}</p>
        {secrets && (
          <p className="ops-page-meta">
            SMTP: {secrets.smtp_user_hint ?? copy.mailSecretUnset} ·{" "}
            {secrets.smtp_password_configured ? copy.mailSecretSet : copy.mailSecretUnset}
            {" / IMAP: "}
            {secrets.imap_user_hint ?? copy.mailSecretUnset} ·{" "}
            {secrets.imap_password_configured ? copy.mailSecretSet : copy.mailSecretUnset}
          </p>
        )}
        <label className="wallet-field">
          {copy.mailSmtpUser}
          <input
            value={smtpUser}
            autoComplete="off"
            onChange={(e) => setSmtpUser(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          {copy.mailSmtpPassword}
          <input
            type="password"
            value={smtpPassword}
            autoComplete="new-password"
            onChange={(e) => setSmtpPassword(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          {copy.mailImapHost}
          <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
        </label>
        <label className="wallet-field">
          {copy.mailImapUser}
          <input
            value={imapUser}
            autoComplete="off"
            onChange={(e) => setImapUser(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          {copy.mailImapPassword}
          <input
            type="password"
            value={imapPassword}
            autoComplete="new-password"
            onChange={(e) => setImapPassword(e.target.value)}
          />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={
              busy ||
              !(
                smtpUser.trim() ||
                smtpPassword ||
                imapUser.trim() ||
                imapPassword ||
                imapHost.trim()
              )
            }
            onClick={() => void saveMailSecrets()}
          >
            {copy.mailSecretsSave}
          </button>
        </div>
      </section>

      <section className="ops-card">
        <h2 className="section-title">Passkey（ログイン必須）</h2>
        <p className="ops-page-meta">
          {passkeyDone
            ? "CEO Passkey 登録済みです。ログインゲートはクリアです。"
            : "ログインには Passkey が必須です。帳簿の利用準備（会社情報＋初回仕訳）とは別ゲートです。"}
        </p>
        {passkeyMsg && <p className="ops-page-meta">{passkeyMsg}</p>}
        {!passkeyDone && (
          <div className="section-actions">
            {bootstrapRequired && (
              <label className="wallet-field">
                Bootstrap トークン
                <input
                  value={bootstrapToken}
                  onChange={(e) => setBootstrapToken(e.target.value)}
                  placeholder="必要な場合のみ"
                />
              </label>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void registerPasskeyInline()}
            >
              Passkey を登録
            </button>
            <a className="quiet-button" href="/settings/">
              設定画面でも登録可
            </a>
          </div>
        )}
      </section>

      <section className="ops-card">
        <h2 className="section-title">初回仕訳</h2>
        <p className="ops-page-meta">
          {firstJeDone
            ? "仕訳が登録済みです。"
            : "COA 準拠の最小仕訳（現金／売上）を1件投稿します。monthly YAML は不要です。"}
        </p>
        {!firstJeDone && (
          <>
            <label className="wallet-field">
              対象月
              <input
                value={firstJeMonth}
                onChange={(e) => setFirstJeMonth(e.target.value)}
              />
            </label>
            <div className="section-actions">
              <button
                type="button"
                className="primary-button"
                disabled={busy || !companyName.trim()}
                onClick={() => void postFirstJournal()}
              >
                初回仕訳を投稿
              </button>
              {!companyDone && (
                <p className="ops-page-meta">会社情報を保存してから初回仕訳を投稿してください。</p>
              )}
            </div>
          </>
        )}
        {customerReady && (
          <p className="section-cta">
            <a className="primary-button" href="/?ledger=1">
              帳簿ワークベンチへ
            </a>
          </p>
        )}
      </section>

      <section className="ops-card">
        <h2 className="section-title">推奨ステップ</h2>
        <p className="ops-page-meta">
          Passkey はログイン必須。会社情報と初回仕訳が揃うと帳簿を使えます。電子帳簿の優良要件は別オプションです。
        </p>
        <ul>
          {recommended.map((step) => (
            <li key={step.id}>
              {step.complete ? "✓" : "·"} {step.label}
              {step.detail ? ` — ${step.detail}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </OpsPage>
  );
}
