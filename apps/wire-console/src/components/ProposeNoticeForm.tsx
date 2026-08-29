import { useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { api, NOTICE_TYPES, type PeerProfile } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  tenantId: string;
  peers: PeerProfile[];
  onDone: () => void;
}

export function ProposeNoticeForm({ tenantId, peers, onDone }: Props) {
  const copy = useCopy(WIRE_COPY);
  const noticeLabels: Record<string, string> = {
    "contract.execution.notice": copy.noticeContractExec,
    "obligation.acknowledged": copy.noticeObligation,
    "invoice.issued": copy.noticeInvoice,
    "payment.instructed": copy.noticePayment,
    "contract.executed": copy.noticeContractDone,
  };
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
      <h3>{copy.proposeTitle}</h3>
      <form className="inline-form" onSubmit={submit}>
        <label>
          {copy.composeTo}
          <select value={peerId} onChange={(e) => setPeerId(e.target.value)} required>
            {peers.map((p) => (
              <option key={p.peer_id} value={p.peer_id}>
                {p.peer_id} · {p.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.composeKind}
          <select value={txType} onChange={(e) => setTxType(e.target.value)}>
            {NOTICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {noticeLabels[t.value] ?? t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.composeContract}
          <input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="CTR-012" />
        </label>
        <label>
          {copy.composeEvent}
          <input
            value={correlationEventId}
            onChange={(e) => setCorrelationEventId(e.target.value)}
            placeholder={copy.composeEventPh}
          />
        </label>
        <label className="wide">
          {copy.composeBody}
          <input value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !peerId}>
          {busy ? copy.proposing : copy.propose}
        </button>
      </form>
      {lastId ? <p className="hint">Created {lastId} — approve below.</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
