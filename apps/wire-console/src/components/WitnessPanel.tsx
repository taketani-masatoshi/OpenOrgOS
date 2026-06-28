import { useEffect, useState } from "react";
import { api, type WitnessStatus } from "../api";

interface Props {
  tenantId: string;
  selectedEventId?: string;
  onDone: () => void;
}

export function WitnessPanel({ tenantId, selectedEventId, onDone }: Props) {
  const [status, setStatus] = useState<WitnessStatus | null>(null);
  const [eventId, setEventId] = useState(selectedEventId ?? "");
  const [side, setSide] = useState<"sent" | "received">("sent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  useEffect(() => {
    if (selectedEventId) setEventId(selectedEventId);
  }, [selectedEventId]);

  useEffect(() => {
    void api<{ ok: boolean } & WitnessStatus>(`/console/v1/tenants/${tenantId}/witness/status`)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [tenantId]);

  async function flush() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; flushed: number }>(
        `/console/v1/tenants/${tenantId}/witness/flush-pending`,
        { method: "POST", body: "{}" }
      );
      setVerifyResult(`Flushed ${res.flushed} witness attestation(s)`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        ok: boolean;
        quorum: { satisfied: boolean; matched: number; required: number };
      }>(`/console/v1/tenants/${tenantId}/witness/register`, {
        method: "POST",
        body: JSON.stringify({ event_id: eventId, side }),
      });
      setVerifyResult(
        `Registered · quorum ${res.quorum.matched}/${res.quorum.required} ${
          res.quorum.satisfied ? "OK" : "pending"
        }`
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!eventId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        ok: boolean;
        quorum: { satisfied: boolean; matched: number; required: number };
        receipts: { hub_id: string }[];
        issues: string[];
      }>(`/console/v1/tenants/${tenantId}/witness/verify`, {
        method: "POST",
        body: JSON.stringify({ event_id: eventId }),
      });
      setVerifyResult(
        `${res.receipts.length} receipt(s) · quorum ${res.quorum.matched}/${res.quorum.required} ${
          res.quorum.satisfied ? "OK" : "FAIL"
        }${res.issues.length ? ` · ${res.issues.join("; ")}` : ""}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>
        Witness{" "}
        {status?.pool.enabled ? (
          <span className="badge ok">
            {status.pool.hub_count} hub(s) · {status.pool.quorum_mode}
          </span>
        ) : (
          <span className="badge">disabled</span>
        )}
      </h3>
      <div className="row-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void flush()}>
          Flush pending
        </button>
        <button type="button" className="secondary" disabled={busy || !eventId} onClick={() => void verify()}>
          Verify event
        </button>
      </div>
      <form className="inline-form" onSubmit={register}>
        <label className="wide">
          event_id
          <input value={eventId} onChange={(e) => setEventId(e.target.value)} />
        </label>
        <label>
          side
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as "sent" | "received")}
            aria-label="side"
          >
            <option value="sent">sent</option>
            <option value="received">received</option>
          </select>
        </label>
        <button type="submit" disabled={busy || !eventId}>
          Register attestation
        </button>
      </form>
      {status?.pending.length ? (
        <p className="hint">{status.pending.length} witness attestation(s) pending</p>
      ) : null}
      {verifyResult ? <p className="hint">{verifyResult}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
