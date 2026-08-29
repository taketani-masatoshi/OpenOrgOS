import { useEffect, useState } from "react";
import { chatApi, fetchGuestSetup } from "./api";
import { registerWithWebAuthn } from "./webauthn-register";

export function GuestSetupPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token")?.trim() ?? "";
  const [email, setEmail] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [approverId, setApproverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("招待リンクが無効です（トークンがありません）");
      return;
    }
    void fetchGuestSetup(token)
      .then((result) => {
        setEmail(result.email);
        setOperatorId(result.operator_id);
        setApproverId(result.approver_id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);

  async function onRegister() {
    if (!token || !operatorId || !approverId) return;
    setBusy(true);
    setError(null);
    try {
      await registerWithWebAuthn(chatApi, {
        operator_id: operatorId,
        approver_id: approverId,
        guest_invite_token: token,
      });
      setDone(true);
      window.setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap">
      <h1 className="page-title">ゲストアクセス設定</h1>
      <p className="page-desc">
        税理士・監査向けの読み取り専用アクセスです。Passkey を登録してログインしてください。
      </p>
      {done ? (
        <section className="lf-card">
          <p>Passkey の登録が完了しました。コンソールへ移動します…</p>
        </section>
      ) : error ? (
        <section className="lf-card">
          <p className="error-banner">{error}</p>
        </section>
      ) : !email ? (
        <p className="muted">招待を確認しています…</p>
      ) : (
        <section className="lf-card">
          <p>
            招待先: <strong>{email}</strong>
          </p>
          <p className="muted">オペレーター ID: {operatorId}</p>
          <div className="section-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void onRegister()}
            >
              {busy ? "登録中…" : "Passkey を登録"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
