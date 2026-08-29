import { useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { api, type DeliveryState } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  tenantId: string;
  delivery: DeliveryState | null;
  onDone: () => void;
}

export function DeliveryPanel({ tenantId, delivery, onDone }: Props) {
  const copy = useCopy(WIRE_COPY);
  const [peerId, setPeerId] = useState("");
  const [eventId, setEventId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function flush() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; flushed: number }>(
        `/console/v1/tenants/${tenantId}/delivery/flush-pending`,
        { method: "POST", body: "{}" }
      );
      setMessage(copy.flushedDeliveries(res.flushed));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deliver(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; delivery: { delivered: boolean; reason: string } }>(
        `/console/v1/tenants/${tenantId}/delivery/deliver`,
        {
          method: "POST",
          body: JSON.stringify({ peer_id: peerId, event_id: eventId }),
        }
      );
      setMessage(
        res.delivery.delivered
          ? copy.deliveredOk(res.delivery.reason)
          : copy.queuedSkipped(res.delivery.reason)
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>
        {copy.deliveryTitle}{" "}
        <span className="count">
          {copy.pendingDelivered(
            delivery?.pending.length ?? 0,
            delivery?.delivered.length ?? 0,
          )}
        </span>
      </h3>
      <div className="row-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void flush()}>
          {copy.flushPending}
        </button>
      </div>
      <form className="inline-form" onSubmit={deliver}>
        <label>
          {copy.peerId}
          <input value={peerId} onChange={(e) => setPeerId(e.target.value)} placeholder="PEER-002" />
        </label>
        <label className="wide">
          {copy.eventId}
          <input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="uuid" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !peerId || !eventId}>
          {copy.send}
        </button>
      </form>
      {delivery?.pending.length ? (
        <ul className="compact-list">
          {delivery.pending.slice(0, 5).map((p) => (
            <li key={`${p.peer_id}:${p.event_id}`}>
              {p.peer_id} · {p.event_id.slice(0, 8)}…
              {p.last_error ? ` · ${p.last_error}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="hint">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
