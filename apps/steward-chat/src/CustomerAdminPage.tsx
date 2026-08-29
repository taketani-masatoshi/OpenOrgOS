import { useCallback, useEffect, useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchProductAdmin,
  fetchProductAccountantFleet,
  fetchProductLegalStatus,
  fetchProductOpsDashboard,
  postProductOperatorInvite,
  type AccountantFleetSnapshot,
  type CustomerAdminSnapshot,
} from "./api";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";

function addMonthsIso(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function isStandingInviteRole(
  role: "operator" | "readonly" | "approver",
  guestExpiry: string,
): boolean {
  if (role === "readonly" && guestExpiry.trim()) return false;
  return true;
}

function emailMatchesCompanyDomains(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const norm = email.trim().toLowerCase();
  const at = norm.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = norm.slice(at + 1);
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

export function CustomerAdminPage() {
  const copy = useCopy(STEWARD_COPY);
  const [payload, setPayload] = useState<CustomerAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"operator" | "readonly" | "approver">("operator");
  const [guestExpiry, setGuestExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountantFleet, setAccountantFleet] = useState<AccountantFleetSnapshot | null>(
    null,
  );

  const [lastSetupUrl, setLastSetupUrl] = useState<string | null>(null);
  const [lastGuestExpiry, setLastGuestExpiry] = useState<string | null>(null);
  const [lastMailId, setLastMailId] = useState<string | null>(null);
  const [legalStatus, setLegalStatus] = useState<{
    status: string;
    detail: string;
    counsel_ready: boolean;
  } | null>(null);
  const [opsDash, setOpsDash] = useState<{
    control_plane_tenant_count: number;
    ledger_product_tenant_count: number;
    tenants: Array<{ tenant_id: string; company_name: string; host: string | null }>;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const admin = await fetchProductAdmin();
      setPayload(admin);
      if (admin.subscription?.plan === "accountant") {
        setAccountantFleet(await fetchProductAccountantFleet());
      } else {
        setAccountantFleet(null);
      }
      const legal = await fetchProductLegalStatus().catch(() => null);
      if (legal) {
        setLegalStatus({
          status: legal.status,
          detail: legal.detail,
          counsel_ready: legal.counsel_ready,
        });
      }
      const ops = await fetchProductOpsDashboard().catch(() => null);
      if (ops) {
        setOpsDash({
          control_plane_tenant_count: ops.control_plane_tenant_count,
          ledger_product_tenant_count: ops.ledger_product_tenant_count,
          tenants: ops.tenants.map((row) => ({
            tenant_id: row.tenant_id,
            company_name: row.company_name,
            host: row.host,
          })),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invitePolicy = payload?.invite_policy;
  const isStanding = isStandingInviteRole(role, guestExpiry);
  const emailDomainOk = useMemo(
    () => !isStanding || emailMatchesCompanyDomains(email, invitePolicy?.email_domains ?? []),
    [email, invitePolicy?.email_domains, isStanding],
  );

  const inviteBlocked =
    (isStanding && invitePolicy?.standing_invite_blocked) ||
    (!isStanding && !invitePolicy?.guest_invite_allowed);

  const inviteDisabled =
    busy ||
    !displayName ||
    !email ||
    inviteBlocked ||
    (isStanding && !emailDomainOk) ||
    (role === "readonly" && !guestExpiry.trim());

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      const result = await postProductOperatorInvite({
        display_name: displayName,
        email,
        role,
        guest_expires_at: guestExpiry || undefined,
        send_invite_mail: true,
      });
      setLastSetupUrl(result.setup_url ?? null);
      setLastGuestExpiry(guestExpiry || result.guest_expires_at || null);
      setLastMailId(result.mail_id ?? null);
      setDisplayName("");
      setEmail("");
      setGuestExpiry("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!payload) {
    return (
      <OpsPage
        title={copy.account}
        lead="プラン・利用状況・オペレーター招待（CEO / 承認者のみ）。"
        loading
        loadingLabel={copy.loading}
        className="customer-admin-page"
      />
    );
  }

  const usage = payload.usage;
  const policy = payload.invite_policy;

  return (
    <OpsPage
      title={copy.account}
      lead="プラン・利用状況・オペレーター招待（CEO / 承認者のみ）。"
      error={error}
      className="customer-admin-page"
    >

      {payload.platform_billing_settings && (
        <section className="ops-card">
          <h2 className="section-title">Stripe 課金</h2>
          <p className="muted">
            本番投入の前に初期設定で Stripe キーを登録します。
          </p>
          <p className="section-cta">
            <a className="btn btn-primary btn-sm" href="/?product-setup=1">
              本番前の初期設定
            </a>
          </p>
        </section>
      )}

      <section className="ops-card">
        <h2 className="section-title">ログイン方針（login_policy）</h2>
        <ul className="muted">
          <li>
            会社ドメイン:{" "}
            {policy.email_domains.length > 0 ? policy.email_domains.join(", ") : "（未設定）"}
          </li>
          <li>
            創業者移行:{" "}
            {policy.founder_migration_status ?? "—"}
            {policy.grace_until && ` · grace_until ${policy.grace_until.slice(0, 10)}`}
            {policy.grace_days_remaining != null &&
              `（残り ${Math.max(0, policy.grace_days_remaining)} 日）`}
          </li>
          <li>テナント寿命: {policy.tenant_lifecycle}</li>
        </ul>
        {policy.grandfather_active && (
          <p className="muted">
            創業者個人メール枠が有効です。2人目の常勤オペレーターを追加する前に{" "}
            <code>orgos operator founder-email retire</code> が必要です。
          </p>
        )}
        {policy.migration_warnings.map((msg) => (
          <p key={msg} className="muted">
            ⚠ {msg}
          </p>
        ))}
        {policy.standing_invite_block_reason && (
          <p className="muted" role="status">
            常勤招待: {policy.standing_invite_block_reason}
          </p>
        )}
      </section>

      <section className="ops-card">
        <h2 className="section-title">サブスクリプション</h2>
        {payload.subscription ? (
          <>
            <ul>
              <li>プラン: {payload.subscription.plan}</li>
              <li>状態: {payload.subscription.status}</li>
              {payload.subscription.trial_ends_at && (
                <li>トライアル終了: {payload.subscription.trial_ends_at.slice(0, 10)}</li>
              )}
            </ul>
            {(payload.subscription.status === "past_due" ||
              payload.subscription.status === "unpaid") && (
              <div className="error-banner" role="alert">
                <p>
                  お支払いに問題があります。カード情報を更新しないと、帳簿の一部機能が制限されることがあります。
                </p>
                {payload.billing_portal_url ? (
                  <p className="section-cta">
                    <a className="btn btn-primary btn-sm" href={payload.billing_portal_url}>
                      お支払い方法を更新
                    </a>
                    {payload.billing_portal_mode === "stub" && (
                      <span className="muted">
                        （本番では Stripe Billing Portal のみ。stub は利用できません）
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="muted">
                    請求ポータル URL が未設定です。サポート（support@oorgos.org）へご連絡ください。
                  </p>
                )}
              </div>
            )}
            {payload.billing_portal_url &&
              payload.subscription.status !== "past_due" &&
              payload.subscription.status !== "unpaid" && (
              <p className="section-cta">
                <a className="btn btn-primary btn-sm" href={payload.billing_portal_url}>
                  請求・プラン管理
                </a>
                {payload.billing_portal_mode === "stub" && (
                  <span className="muted">（開発 stub — 本番では非表示）</span>
                )}
              </p>
            )}
          </>
        ) : (
          <p className="muted">サブスクリプション未設定（オンプレ / 手動契約）</p>
        )}
      </section>

      <section className="ops-card">
        <h2 className="section-title">契約文書ステータス</h2>
        {legalStatus ? (
          <p className="muted">
            status: <code>{legalStatus.status}</code> — {legalStatus.detail}
            {!legalStatus.counsel_ready && "（ドラフト掲載中・署名扱いしません）"}
          </p>
        ) : (
          <p className="muted">契約ステータスを取得できませんでした</p>
        )}
      </section>

      {opsDash ? (
        <section className="ops-card">
          <h2 className="section-title">コントロールプレーン</h2>
          <p className="muted">
            Ledger テナント {opsDash.ledger_product_tenant_count} · 登録{" "}
            {opsDash.control_plane_tenant_count}
          </p>
          {opsDash.tenants.length > 0 ? (
            <ul className="muted">
              {opsDash.tenants.slice(0, 50).map((row) => (
                <li key={row.tenant_id}>
                  {row.company_name} ({row.tenant_id})
                  {row.host ? ` · ${row.host}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="ops-card">
        <h2 className="section-title">利用状況</h2>
        <p className="muted">
          仕訳 {usage.journal_entries} 件 · 当月 {usage.current_month_entries} 件
          {usage.journal_limit_per_month != null && (
            <>
              {" "}
              / 上限 {usage.journal_limit_per_month} 件
              {usage.limit_remaining != null && `（残り ${usage.limit_remaining}）`}
            </>
          )}
        </p>
        {usage.limit_exceeded && (
          <p className="muted">Starter プランの月間上限に達しています。Business へのアップグレードをご検討ください。</p>
        )}
      </section>

      {accountantFleet && accountantFleet.clients.length > 0 && (
        <section className="ops-card">
          <h2 className="section-title">顧問先フリート</h2>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>テナント</th>
                <th>会社名</th>
                <th>プラン</th>
                <th>ホスト</th>
              </tr>
            </thead>
            <tbody>
              {accountantFleet.clients.map((row) => (
                <tr key={row.tenant_id}>
                  <td>{row.tenant_id}</td>
                  <td>{row.company_name}</td>
                  <td>{row.plan ?? "—"}</td>
                  <td>{row.host ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="ops-card">
        <h2 className="section-title">オペレーター</h2>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名前</th>
              <th>ロール</th>
              <th>メール</th>
              <th>ゲスト期限</th>
            </tr>
          </thead>
          <tbody>
            {payload.operators.map((row) => (
              <tr key={row.operator_id}>
                <td>{row.operator_id}</td>
                <td>{row.display_name}</td>
                <td>{row.role}</td>
                <td>{row.email ?? "—"}</td>
                <td>
                  {row.guest_expires_at
                    ? `${row.guest_expires_at.slice(0, 10)}${row.guest_expired ? "（期限切れ）" : ""}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ops-card">
        <h2 className="section-title">オペレーター招待</h2>
        {isStanding && (
          <ol className="muted page-desc">
            <li>招待メールは Community と同じアドレス（会社ドメイン）にする</li>
            <li>相手が Community で Google ログインし、OOO 認定を申請・承認する</li>
            <li>My Page → Operator Console → PassKey 初回登録</li>
          </ol>
        )}
        <div className="section-actions">
          <input
            placeholder="表示名"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            placeholder={
              policy.email_domains.length > 0
                ? `name@${policy.email_domains[0]}`
                : "email@example.com"
            }
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="operator">経理担当（常勤）</option>
            <option value="readonly">閲覧のみ（税理士ゲスト）</option>
            <option value="approver">承認者（常勤）</option>
          </select>
          <input
            type="date"
            aria-label="ゲスト期限"
            value={guestExpiry}
            onChange={(e) => setGuestExpiry(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setGuestExpiry(addMonthsIso(3))}
          >
            +3か月
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={inviteDisabled}
            onClick={() => void invite()}
          >
            招待
          </button>
        </div>
        {isStanding && email && !emailDomainOk && (
          <p className="muted" role="alert">
            常勤オペレーターのメールは login_policy.email_domains（
            {policy.email_domains.join(", ") || "—"}）内である必要があります。
          </p>
        )}
        {lastSetupUrl && (
          <>
            <p className="muted">
              setup_url: <code>{lastSetupUrl}</code>{" "}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void navigator.clipboard.writeText(lastSetupUrl)}
              >
                コピー
              </button>
            </p>
            {lastGuestExpiry && (
              <p className="muted">ゲスト期限: {lastGuestExpiry.slice(0, 10)}</p>
            )}
            {lastMailId && (
              <p className="muted">招待メール送信済み（outbox: {lastMailId}）</p>
            )}
            <ol className="muted page-desc">
              <li>setup_url をゲストに共有（コピー）または招待メールを確認</li>
              <li>ゲストが Passkey を登録してログイン</li>
              <li>閲覧のみロール・期限を確認。期限切れ時は再招待</li>
            </ol>
          </>
        )}
        <p className="muted">
          税理士ゲストは「閲覧のみ」+ 期限を設定してください。常勤（経理・承認者）は期限不要です。
        </p>
      </section>
    </OpsPage>
  );
}
