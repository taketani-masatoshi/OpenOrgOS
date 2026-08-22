import { useEffect, useState } from "react";

export type PasskeySetupCardProps = {
  settlementReady: boolean;
  busy?: boolean;
  error?: string | null;
  onRegister: () => void | Promise<void>;
  /** Optional re-register (same hybrid create). */
  onReregister?: () => void | Promise<void>;
};

/**
 * After login: settle PassKey status + hybrid register on this page.
 */
export function PasskeySetupCard({
  settlementReady,
  busy = false,
  error = null,
  onRegister,
  onReregister,
}: PasskeySetupCardProps) {
  const [localBusy, setLocalBusy] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const [wasReady, setWasReady] = useState(settlementReady);
  const running = busy || localBusy;

  useEffect(() => {
    if (settlementReady && !wasReady) {
      setJustRegistered(true);
      const t = window.setTimeout(() => setJustRegistered(false), 4000);
      return () => window.clearTimeout(t);
    }
    setWasReady(settlementReady);
  }, [settlementReady, wasReady]);

  async function start(fn: () => void | Promise<void>) {
    if (running) return;
    setLocalBusy(true);
    try {
      await fn();
    } finally {
      setLocalBusy(false);
    }
  }

  if (settlementReady) {
    return (
      <section
        className={`passkey-setup is-ready${justRegistered ? " is-success" : ""}`}
        aria-label="決済鍵の状態"
      >
        <div className="passkey-setup-copy">
          <h2 className="passkey-setup-title">決済 PassKey</h2>
          <p className="passkey-setup-status-pill" role="status">
            登録済み
          </p>
          <p className="passkey-setup-lead">
            {justRegistered
              ? "登録できました。高額承認のとき、この Mac のブラウザが QR を出します。"
              : "高額承認のとき、ブラウザの QR を iPhone のカメラで読みます。Bluetooth をオンにしてください。"}
          </p>
          {onReregister ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={running}
              onClick={() => void start(onReregister)}
            >
              {running ? "確認中…" : "別の iPhone で登録"}
            </button>
          ) : null}
          {error ? <p className="passkey-setup-error">{error}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="passkey-setup" aria-label="決済鍵の準備">
      <div className="passkey-setup-copy">
        <h2 className="passkey-setup-title">iPhone の決済 PassKey</h2>
        <p className="passkey-setup-status-pill is-pending" role="status">
          未登録
        </p>
        <p className="passkey-setup-lead">
          「iPhone で登録」を押し、ブラウザの QR を iPhone のカメラで読んでください。Bluetooth
          をオンにしてください。
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={running}
          onClick={() => void start(onRegister)}
        >
          {running ? "ブラウザの QR を表示中…" : "iPhone で登録"}
        </button>
        {error ? <p className="passkey-setup-error">{error}</p> : null}
      </div>
    </section>
  );
}
