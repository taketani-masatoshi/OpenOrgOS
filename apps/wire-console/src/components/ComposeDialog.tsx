import { useState } from "react";
import { api, NOTICE_TYPES, type PeerProfile } from "../api";

interface Props {
  tenantId: string;
  peers: PeerProfile[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function ComposeDialog({ tenantId, peers, open, onClose, onDone }: Props) {
  const [peerId, setPeerId] = useState(peers[0]?.peer_id ?? "");
  const [txType, setTxType] = useState(NOTICE_TYPES[0]!.value);
  const [contractId, setContractId] = useState("");
  const [correlationEventId, setCorrelationEventId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  if (!open) return null;

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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="compose-backdrop" role="presentation" onClick={onClose}>
      <section
        className="compose-dialog panel"
        role="dialog"
        aria-labelledby="compose-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-header">
          <h3 id="compose-title">新規作成</h3>
          <button type="button" className="secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
        <form className="compose-form" onSubmit={submit}>
          <label>
            宛先
            <select value={peerId} onChange={(e) => setPeerId(e.target.value)} required>
              {peers.map((p) => (
                <option key={p.peer_id} value={p.peer_id}>
                  {p.display_name} ({p.peer_id})
                </option>
              ))}
            </select>
          </label>
          <label>
            種別
            <select value={txType} onChange={(e) => setTxType(e.target.value)}>
              {NOTICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            契約 ID
            <input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="CTR-012" />
          </label>
          <label>
            関連イベント ID
            <input
              value={correlationEventId}
              onChange={(e) => setCorrelationEventId(e.target.value)}
              placeholder="uuid（返信時）"
            />
          </label>
          <label>
            本文
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
          </label>
          <div className="compose-actions">
            <button type="submit" disabled={busy || !peerId}>
              {busy ? "送信中…" : "送信申請"}
            </button>
          </div>
        </form>
        {lastId ? <p className="hint">作成しました: {lastId}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
