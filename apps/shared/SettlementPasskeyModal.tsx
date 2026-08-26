import { useEffect, useRef, useState } from "react";
import { completeSettlementPasskey } from "./complete-settlement-passkey";
import { SETTLEMENT_COPY } from "./console-copy";
import { useCopy } from "./define-copy";
import { useUiLocale } from "./useUiLocale";
import { webauthnUserMessage } from "./webauthn-user-error";
import type { PasskeyCeremonyKind } from "./passkey-ceremony";

export type SettlementPasskeyChallenge = {
  challenge_id: string;
  token: string;
  webauthn_challenge: string;
  rp_id: string;
  ceremony_kind?: PasskeyCeremonyKind;
  expires_at?: string;
  hints?: Array<"hybrid" | "client-device">;
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

type ModalStatus = "ready" | "waiting" | "done" | "error";

/**
 * Hybrid settlement get on the console page — manual start, retry, cancel-safe.
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
  const [status, setStatus] = useState<ModalStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  const apiRef = useRef(api);
  onSuccessRef.current = onSuccess;
  apiRef.current = api;

  const copy = useCopy(SETTLEMENT_COPY);
  const locale = useUiLocale();
  const amount = challenge.summary.amount
    ? `${challenge.summary.amount.value.toLocaleString(locale === "en" ? "en-US" : "ja-JP")} ${challenge.summary.amount.currency}`
    : "—";
  const subject = challenge.summary.message || challenge.summary.subject_type;

  useEffect(() => {
    if (status !== "waiting") return;

    cancelledRef.current = false;
    let alive = true;

    void (async () => {
      try {
        await completeSettlementPasskey(apiRef.current, {
          challenge_id: challenge.challenge_id,
          token: challenge.token,
          webauthn_challenge: challenge.webauthn_challenge,
          rp_id: challenge.rp_id,
          ceremony_kind: challenge.ceremony_kind ?? "settlement",
          allow_credentials: challenge.allow_credentials,
          hints: challenge.hints,
        });
        if (!alive || cancelledRef.current) return;
        setStatus("done");
        window.setTimeout(() => {
          if (!cancelledRef.current) onSuccessRef.current();
        }, 600);
      } catch (err) {
        if (!alive || cancelledRef.current) return;
        const message = webauthnUserMessage(err, { purpose: "settlement" });
        setStatus("error");
        setError(message);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    attempt,
    status,
    challenge.challenge_id,
    challenge.token,
    challenge.webauthn_challenge,
    challenge.rp_id,
    challenge.ceremony_kind,
    challenge.hints,
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

  function startCeremony() {
    cancelledRef.current = false;
    setError(null);
    setStatus("waiting");
  }

  function retry() {
    cancelledRef.current = false;
    setError(null);
    setAttempt((n) => n + 1);
    setStatus("waiting");
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
        <h2 id="settlement-passkey-title">{copy.title}</h2>
        <p className="settlement-qr-lead">
          {status === "done"
            ? copy.done
            : status === "error"
              ? error || copy.failed
              : status === "waiting"
                ? copy.waiting
                : copy.ready}
        </p>
        {status === "ready" ? (
          <p className="settlement-qr-hint">{copy.notLoginKey}</p>
        ) : null}
        {status === "ready" || status === "waiting" ? (
          <p className="settlement-qr-hint">{copy.bluetoothOn}</p>
        ) : null}
        {status === "error" ? (
          <p className="settlement-qr-hint">{copy.retryHint}</p>
        ) : null}
        <dl className="settlement-qr-meta">
          <div>
            <dt>{copy.amount}</dt>
            <dd>{amount}</dd>
          </div>
          <div>
            <dt>{copy.subject}</dt>
            <dd>{subject}</dd>
          </div>
        </dl>
        <div className="settlement-qr-actions">
          {status === "ready" ? (
            <button type="button" className="btn btn-primary" onClick={startCeremony}>
              {copy.start}
            </button>
          ) : null}
          {status === "error" ? (
            <button type="button" className="btn btn-primary" onClick={retry}>
              {copy.again}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={cancel}
            disabled={status === "done"}
          >
            {status === "waiting" ? copy.cancel : copy.close}
          </button>
        </div>
      </div>
    </div>
  );
}
