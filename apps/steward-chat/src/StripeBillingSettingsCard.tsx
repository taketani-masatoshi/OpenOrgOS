import { useCallback, useEffect, useState } from "react";
import {
  fetchProductStripeSettings,
  updateProductStripeSettings,
  type ProductStripeSettings,
} from "./api";

export function StripeBillingSettingsCard({ onSaved }: { onSaved?: () => void }) {
  const [status, setStatus] = useState<ProductStripeSettings | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [priceStarter, setPriceStarter] = useState("");
  const [priceBusiness, setPriceBusiness] = useState("");
  const [priceAccountant, setPriceAccountant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProductStripeSettings();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (busy) return;
    if (!secretKey.trim() && !webhookSecret.trim() && !status?.secret_configured) {
      setError("Secret Key と Webhook Secret の両方が必要です");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const data = await updateProductStripeSettings({
        stripe_secret_key: secretKey.trim() || undefined,
        stripe_webhook_secret: webhookSecret.trim() || undefined,
        stripe_price_starter: priceStarter.trim() || undefined,
        stripe_price_business: priceBusiness.trim() || undefined,
        stripe_price_accountant: priceAccountant.trim() || undefined,
      });
      setStatus(data);
      setSecretKey("");
      setWebhookSecret("");
      setSaved(
        data.commercial_ready
          ? "Stripe 設定を保存しました（commercial 準備完了）"
          : "Stripe 設定を保存しました",
      );
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <section className="ops-card">
        <h2 className="section-title">Stripe 課金設定</h2>
        <p className="muted">読み込み中…</p>
        {error && (
          <p className="muted" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="ops-card">
      <h2 className="section-title">Stripe 課金設定（プラットフォーム）</h2>
      <p className="muted page-desc">
        本番投入の<strong>前</strong>にここで設定してください。値は{" "}
        <code>data/product/stripe-secrets.env</code>（gitignore）に保存され、Checkout /
        Webhook が有効になります。本番前は <code>sk_test_</code> でも commercial readiness
        の <code>stripe-live</code> は合格します。セルフサーブ live 課金の開始時に{" "}
        <code>sk_live_</code> へ差し替えてください。Docker の環境変数が既にある場合はそちらが優先されます。
      </p>
      <ul className="muted">
        <li>
          モード: <code>{status.mode}</code>
          {status.commercial_ready ? " · commercial 準備 OK" : " · キー未設定"}
        </li>
        <li>
          Webhook URL: <code>{status.webhook_url}</code>
        </li>
        <li>
          保存先: <code>{status.storage_path}</code>
        </li>
        {status.secret_key_hint && <li>Secret Key: {status.secret_key_hint}</li>}
        {status.webhook_secret_hint && <li>Webhook Secret: {status.webhook_secret_hint}</li>}
      </ul>
      {status.next_steps && status.next_steps.length > 0 ? (
        <ol className="muted">
          {status.next_steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}

      <div className="section-actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <label>
          <span className="muted">Stripe Secret Key</span>
          <input
            type="password"
            autoComplete="off"
            placeholder={status.secret_configured ? "変更する場合のみ入力" : "sk_live_… または sk_test_…"}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          <span className="muted">Webhook Signing Secret</span>
          <input
            type="password"
            autoComplete="off"
            placeholder={status.webhook_secret_configured ? "変更する場合のみ入力" : "whsec_…"}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          <span className="muted">Price ID（Starter · 任意）</span>
          <input
            placeholder="price_…"
            value={priceStarter}
            onChange={(e) => setPriceStarter(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          <span className="muted">Price ID（Business · 任意）</span>
          <input
            placeholder="price_…"
            value={priceBusiness}
            onChange={(e) => setPriceBusiness(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          <span className="muted">Price ID（Accountant · 任意）</span>
          <input
            placeholder="price_…"
            value={priceAccountant}
            onChange={(e) => setPriceAccountant(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void save()}
        >
          保存
        </button>
      </div>

      {error && (
        <p className="muted" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="chat-settings-ok" role="status">
          {saved}
        </p>
      )}
    </section>
  );
}
