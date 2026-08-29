import { useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { api, type WitnessStatus } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  tenantId: string;
  selectedEventId?: string;
  onDone: () => void;
}

export function WitnessPanel({ tenantId, selectedEventId, onDone }: Props) {
  const copy = useCopy(WIRE_COPY);
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
      setVerifyResult(copy.flushedWitness(res.flushed));
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
        copy.registeredQuorum(
          res.quorum.matched,
          res.quorum.required,
          res.quorum.satisfied,
        ),
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
        `${copy.verifyQuorum(
          res.receipts.length,
          res.quorum.matched,
          res.quorum.required,
          res.quorum.satisfied,
        )}${res.issues.length ? ` · ${res.issues.join("; ")}` : ""}`,
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
        {copy.witnessTitle}{" "}
        {status?.pool.enabled ? (
          <span className="badge ok">
            {copy.hubsMode(status.pool.hub_count, status.pool.quorum_mode ?? "")}
          </span>
        ) : (
          <span className="badge">{copy.disabled}</span>
        )}
      </h3>
      <div className="row-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void flush()}>
          {copy.flushPending}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || !eventId} onClick={() => void verify()}>
          {copy.verifyEvent}
        </button>
      </div>
      <form className="inline-form" onSubmit={register}>
        <label className="wide">
          {copy.eventId}
          <input value={eventId} onChange={(e) => setEventId(e.target.value)} />
        </label>
        <label>
          {copy.side}
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as "sent" | "received")}
            aria-label={copy.side}
          >
            <option value="sent">{copy.sideSent}</option>
            <option value="received">{copy.sideReceived}</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !eventId}>
          {copy.registerAttestation}
        </button>
      </form>
      {status?.pending.length ? (
        <p className="hint">{copy.pendingWitnessCount(status.pending.length)}</p>
      ) : null}
      {verifyResult ? <p className="hint">{verifyResult}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
