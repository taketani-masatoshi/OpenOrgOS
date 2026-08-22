import { useEffect, useRef, useState } from "react";
import { completeSettlementPasskey } from "./complete-settlement-passkey";
import { webauthnUserMessage } from "./webauthn-user-error";

export type SettlementPasskeyChallenge = {
  challenge_id: string;
  token: string;
  webauthn_challenge: string;
  rp_id: string;
  expires_at?: string;
  summary: {
    approval_id: string;
    subject_type: string;
    subject_ref?: string;
    message?: string;
    amount?: { value: number; currency: string };
    tier?: string;
  };
  allow_credentials: {
    id: string;
    type: string;
    transports?: Array<"hybrid" | "internal" | "usb" | "nfc" | "ble">;
  }[];
};

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Hybrid settlement get on the console page — status, retry, cancel-safe.
 */
export function SettlementPasskeyModal({
  challenge,
  api,
  onSuccess,
  onCancel,
}: {
  challenge: SettlementPasskeyChallenge;
  api: Api;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"waiting" | "done" | "error">("waiting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  const apiRef = useRef(api);
  onSuccessRef.current = onSuccess;
  apiRef.current = api;

  const amount = challenge.summary.amount
    ? `${challenge.summary.amount.value.toLocaleString("ja-JP")} ${challenge.summary.amount.currency}`
    : "—";
  const subject = challenge.summary.message || challenge.summary.subject_type;

  useEffect(() => {
    cancelledRef.current = false;
    let alive = true;
    setStatus("waiting");
    setError(null);

    void (async () => {
      try {
        await completeSettlementPasskey(apiRef.current, {
          challenge_id: challenge.challenge_id,
          token: challenge.token,
          webauthn_challenge: challenge.webauthn_challenge,
          rp_id: challenge.rp_id,
          allow_credentials: challenge.allow_credentials,
          hints: ["hybrid"],
        });
        if (!alive || cancelledRef.current) return;
        setStatus("done");
        window.setTimeout(() => {
          if (!cancelledRef.current) onSuccessRef.current();
        }, 600);
      } catch (err) {
        if (!alive || cancelledRef.current) return;
        setStatus("error");
        setError(webauthnUserMessage(err));
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    attempt,
    challenge.challenge_id,
    challenge.token,
    challenge.webauthn_challenge,
    challenge.rp_id,
    challenge.allow_credentials,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "done") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  function cancel() {
    cancelledRef.current = true;
    onCancel();
  }

  function retry() {
    cancelledRef.current = false;
    setAttempt((n) => n + 1);
  }

  return (
    <div
      className="settlement-qr-backdrop"
      role="dialog"
      aria-modal="true"
      aria-busy={status === "waiting"}
      aria-labelledby="settlement-passkey-title"
    >
      <div className="settlement-qr-card">
        <h2 id="settlement-passkey-title">iPhone の PassKey で承認</h2>
        <p className="settlement-qr-lead">
          {status === "done"
            ? "承認できました。"
            : status === "error"
              ? error || "承認できませんでした。"
              : "ブラウザの PassKey シートを開いています。iPhone のカメラで QR を読んでください。"}
        </p>
        {status === "waiting" ? (
          <p className="settlement-qr-hint">Mac と iPhone の Bluetooth をオンにしてください。</p>
        ) : null}
        {status === "error" ? (
          <p className="settlement-qr-hint">
            Bluetooth がオフ、または距離が遠いと失敗します。もう一度試してください。
          </p>
        ) : null}
        <dl className="settlement-qr-meta">
          <div>
            <dt>金額</dt>
            <dd>{amount}</dd>
          </div>
          <div>
            <dt>件名</dt>
            <dd>{subject}</dd>
          </div>
        </dl>
        <div className="settlement-qr-actions">
          {status === "error" ? (
            <button type="button" className="btn btn-primary" onClick={retry}>
              もう一度
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={cancel}
            disabled={status === "done"}
          >
            {status === "waiting" ? "キャンセル" : "閉じる"}
          </button>
        </div>
      </div>
    </div>
  );
}
