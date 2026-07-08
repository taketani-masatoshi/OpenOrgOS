import { useState } from "react";
import { api, NOTICE_TYPES, type PeerProfile } from "../api";

interface Props {
  tenantId: string;
  peers: PeerProfile[];
  onDone: () => void;
}

export function ProposeNoticeForm({ tenantId, peers, onDone }: Props) {
  const [peerId, setPeerId] = useState(peers[0]?.peer_id ?? "");
  const [txType, setTxType] = useState(NOTICE_TYPES[0]!.value);
  const [contractId, setContractId] = useState("");
  const [correlationEventId, setCorrelationEventId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; notice: { notice_id: string } }>(
        `/console/v1/tenants/${tenantId}/notices/propose`,
        {
          method: "POST",
          body: JSON.stringify({
            peer_id: peerId,
            transaction_type: txType,
            contract_id: contractId || undefined,
            correlation_event_id: correlationEventId || undefined,
            message: message || undefined,
          }),
        }
      );
      setLastId(res.notice.notice_id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>Propose notice</h3>
      <form className="inline-form" onSubmit={submit}>
        <label>
          peer
          <select value={peerId} onChange={(e) => setPeerId(e.target.value)} required>
            {peers.map((p) => (
              <option key={p.peer_id} value={p.peer_id}>
                {p.peer_id} · {p.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          type
          <select value={txType} onChange={(e) => setTxType(e.target.value)}>
            {NOTICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          contract_id
          <input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="CTR-012" />
        </label>
        <label>
          correlation_event_id
          <input
            value={correlationEventId}
            onChange={(e) => setCorrelationEventId(e.target.value)}
            placeholder="uuid (ack)"
          />
        </label>
        <label className="wide">
          message
          <input value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !peerId}>
          {busy ? "Proposing…" : "Propose"}
        </button>
      </form>
      {lastId ? <p className="hint">Created {lastId} — approve below.</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
