import { useEffect, useState } from "react";
import { chatApi } from "./api";
import { registerWithWebAuthn } from "./webauthn-register";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";

function tokenFromLink(): string {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return (hash.get("bootstrap") ?? query.get("bootstrap") ?? "").trim();
}

export function FounderSetupPage() {
  const [token] = useState(tokenFromLink);
  const [identity, setIdentity] = useState<{ operator_id: string; approver_id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("bootstrap");
    if (url.hash.startsWith("#bootstrap=")) url.hash = "";
    window.history.replaceState({}, "", url);
    if (!token) {
      setError("初回登録リンクにトークンがありません。");
      return;
    }
    void chatApi<{ operator_id: string; approver_id: string }>(
      "/chat/v1/auth/webauthn/bootstrap",
      { method: "POST", body: JSON.stringify({ bootstrap_token: token }) },
    ).then(setIdentity).catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [token]);

  async function register() {
    if (!identity || !token) return;
    setBusy(true);
    setError(null);
    try {
      await registerWithWebAuthn(chatApi, {
        ...identity,
        bootstrap_token: token,
      });
      window.location.replace("/");
    } catch (cause) {
      setError(webauthnUserMessage(cause, { purpose: "login" }));
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap">
      <h1 className="page-title">初回ログイン設定</h1>
      <p className="page-desc">Passkey を登録すると、そのままコンソールにログインできます。</p>
      <section className="lf-card">
        {error && <p className="error-banner">{error}</p>}
        {!error && !identity && <p className="muted">登録リンクを確認しています…</p>}
        {identity && <div className="section-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy}
            onClick={() => void register()}>{busy ? "登録中…" : "Passkey を登録"}</button>
        </div>}
      </section>
    </main>
  );
}
