import { useCallback, useEffect, useRef, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchClaimDesk,
  ingestExpenseClaimFromDesk,
  type ClaimDeskPayload,
} from "./api";
import { claimPlainStatus } from "./claimSettlement";
import {
  barcodeDetectorCtor,
  extractQrPayload,
  isCameraScanSupported,
} from "./qrScan";

function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

/**
 * Employee claim desk. The only surface an `expense:claim` seat can reach:
 * money left, scan the receipt QR, and when it comes back.
 * person_id / org_unit_id are pinned server-side to the session seat.
 */
export function ClaimDeskPage({ onSignOut }: { onSignOut?: () => void }) {
  const copy = useCopy(STEWARD_COPY);
  const [desk, setDesk] = useState<ClaimDeskPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountCode, setAccountCode] = useState("");
  const [qrText, setQrText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await fetchClaimDesk();
      setDesk(next);
      setLoadError(null);
      setAccountCode((current) =>
        current || (next.categories[0]?.account_code ?? ""),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stopScan = useCallback(() => {
    setScanning(false);
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  useEffect(() => stopScan, [stopScan]);

  const startScan = useCallback(async () => {
    const Detector = barcodeDetectorCtor();
    if (!Detector) {
      setMessage(copy.claimDeskNoCamera);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      setMessage(copy.claimDeskScanning);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue;
          if (raw) {
            setQrText(extractQrPayload(raw));
            setMessage(null);
            stopScan();
            return;
          }
        } catch {
          /* keep trying while the stream is live */
        }
        window.setTimeout(() => void tick(), 300);
      };
      void tick();
    } catch {
      stopScan();
      setMessage(copy.claimDeskCameraDenied);
    }
  }, [copy.claimDeskCameraDenied, copy.claimDeskNoCamera, copy.claimDeskScanning, stopScan]);

  async function submit() {
    if (!desk || busy) return;
    const qr = extractQrPayload(qrText);
    if (!qr) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await ingestExpenseClaimFromDesk({
        qr,
        account_code: accountCode,
        expected_claims_revision: desk.claims_revision,
      });
      setDesk(next);
      setQrText("");
      setMessage(next.gate?.message ?? copy.claimDeskDone);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (status: string): string => {
    const plain = claimPlainStatus(status);
    if (plain === "waiting") return copy.claimDeskWaiting;
    if (plain === "sent_back") return copy.claimDeskSentBack;
    return copy.claimDeskPassed;
  };

  return (
    <div className="wallet-shell">
      <div className="wallet-page">
        <header className="wallet-topbar">
          <div className="wallet-brand">
            <span className="wallet-brand-mark" aria-hidden="true">
              ¥
            </span>
            <div>
              <h1 className="wallet-title">{copy.claimDeskTitle}</h1>
              <p className="wallet-brand-sub">{copy.claimDeskLead}</p>
            </div>
          </div>
          {onSignOut ? (
            <button type="button" className="ghost-button" onClick={onSignOut}>
              {copy.claimDeskSignOut}
            </button>
          ) : null}
        </header>

        {loadError ? (
          <p className="empty-copy">{copy.claimDeskNoEnvelope}</p>
        ) : !desk ? (
          <p className="empty-copy">{copy.claimDeskSubmitting}</p>
        ) : (
          <>
            <section className="wallet-panel" aria-label={copy.claimDeskRemaining}>
              <p className="wallet-brand-sub">{desk.display_name}</p>
              <p className="wallet-hero-amount">{yen(desk.remaining_yen)}</p>
              <p className="wallet-brand-sub">{copy.claimDeskRemaining}</p>
            </section>

            <section className="wallet-panel" aria-label={copy.claimDeskTitle}>
              <label className="wallet-field">
                <span>{copy.claimDeskCategory}</span>
                <select
                  value={accountCode}
                  onChange={(event) => setAccountCode(event.target.value)}
                >
                  {desk.categories.map((category) => (
                    <option
                      key={category.account_code}
                      value={category.account_code}
                    >
                      {category.account_name}（{yen(category.remaining_yen)}）
                    </option>
                  ))}
                </select>
              </label>

              {scanning ? (
                <>
                  <video
                    ref={videoRef}
                    className="claim-desk-video"
                    muted
                    playsInline
                  />
                  <button type="button" className="ghost-button" onClick={stopScan}>
                    {copy.claimDeskStopScan}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  disabled={!isCameraScanSupported()}
                  onClick={() => void startScan()}
                >
                  {copy.claimDeskScan}
                </button>
              )}

              <label className="wallet-field">
                <span>{copy.claimDeskPaste}</span>
                <textarea
                  value={qrText}
                  rows={3}
                  onChange={(event) => setQrText(event.target.value)}
                />
              </label>

              <button
                type="button"
                className="primary-button"
                disabled={busy || !qrText.trim() || !accountCode}
                onClick={() => void submit()}
              >
                {busy ? copy.claimDeskSubmitting : copy.claimDeskSubmit}
              </button>
              {message ? <p className="wallet-brand-sub">{message}</p> : null}
            </section>

            <section className="wallet-panel" aria-label={copy.claimDeskMine}>
              <h2 className="wallet-section-title">{copy.claimDeskMine}</h2>
              {desk.claims.length === 0 ? (
                <p className="empty-copy">{copy.claimDeskEmpty}</p>
              ) : (
                <ul className="claim-desk-list">
                  {desk.claims.map((claim) => (
                    <li key={claim.claim_id} className="claim-desk-row">
                      <span className="claim-desk-amount">
                        {yen(claim.amount_yen)}
                      </span>
                      <span>{claim.recipient_name ?? claim.account_name}</span>
                      <span>{statusLabel(claim.status)}</span>
                      <span className="wallet-brand-sub">
                        {claim.due_on
                          ? copy.claimDeskBackOn(claim.due_on)
                          : copy.claimDeskBackUnset}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
