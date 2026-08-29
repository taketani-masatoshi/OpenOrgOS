import { useEffect, useState } from "react";
import { fetchProductPlans, postProductSignup, type LedgerPlan } from "./api";

export function SignupPage() {
  const [plans, setPlans] = useState<LedgerPlan[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [plan, setPlan] = useState("starter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const succeeded = params.get("success") === "1";

  useEffect(() => {
    void fetchProductPlans()
      .then((result) => setPlans(result.plans))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await postProductSignup({
        company_name: companyName,
        admin_email: adminEmail,
        plan,
      });
      setCheckoutUrl(result.checkout_url);
      if (result.checkout_mode === "stub") {
        window.location.href = result.checkout_url;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap">
      <h1 className="page-title">OrgOS Ledger</h1>
      <p className="page-desc">法人向けマネージド単一テナント会計。14 日間トライアル付き。</p>
      <p className="muted">
        電子帳簿保存法の基本要件に対応。e-Tax 申告提出は含みません（顧問 handoff のみ）。
      </p>
      {succeeded ? (
        <section className="lf-card">
          <p>
            お申し込みありがとうございます。決済完了後、専用 URL と Passkey 登録手順をご案内します（メールまたはオペレーターからの連絡）。
          </p>
          <p className="muted">
            電子帳簿は基本要件に対応。優良要件（タイムスタンプ局等）は別オプションです。
          </p>
        </section>
      ) : (
        <form className="lf-card" onSubmit={(event) => void onSubmit(event)}>
          <label className="muted">
            会社名
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label className="muted">
            管理者メール
            <input
              required
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </label>
          <label className="muted">
            プラン
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              {plans.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} — ¥{row.monthly_jpy.toLocaleString()}/月
                </option>
              ))}
            </select>
          </label>
          <div className="section-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "処理中…" : "トライアルを開始"}
            </button>
          </div>
          {checkoutUrl && (
            <p className="muted">
              チェックアウト: <a href={checkoutUrl}>{checkoutUrl}</a>
            </p>
          )}
          {error && <p className="muted">{error}</p>}
        </form>
      )}
    </main>
  );
}
