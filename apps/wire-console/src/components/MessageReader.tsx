import { useEffect, useState } from "react";
import { api, shortDigest, type EventDetail, type EventWorkflow, type HumanMessageBody } from "../api";

interface Props {
  tenantId: string;
  messageId?: string;
  loading: boolean;
  body: HumanMessageBody | null;
  onRefresh: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageReader({ tenantId, messageId, loading, body, onRefresh }: Props) {
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [workflow, setWorkflow] = useState<EventWorkflow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    setActionMessage(null);
    setError(null);
    if (!body?.event_id) {
      setEventDetail(null);
      setWorkflow(null);
      return;
    }
    setDetailLoading(true);
    void Promise.all([
      api<EventDetail & { ok: boolean }>(`/console/v1/tenants/${tenantId}/events/${body.event_id}`),
      api<EventWorkflow & { ok: boolean }>(
        `/console/v1/tenants/${tenantId}/events/${body.event_id}/workflow`
      ),
    ])
      .then(([detail, wf]) => {
        setEventDetail(detail);
        setWorkflow(wf);
      })
      .catch(() => {
        setEventDetail(null);
        setWorkflow(null);
      })
      .finally(() => setDetailLoading(false));
  }, [tenantId, body?.event_id]);

  if (!messageId && !loading) {
    return (
      <aside className="message-reader empty">
        <p className="hint">メッセージを選択してください</p>
      </aside>
    );
  }

  if (loading || !body) {
    return (
      <aside className="message-reader">
        <p className="hint">読み込み中…</p>
      </aside>
    );
  }

  async function approve() {
    if (!body?.approval_id) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/console/v1/tenants/${tenantId}/notices/${body.approval_id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActionMessage("承認しました");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!body?.approval_id) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/console/v1/tenants/${tenantId}/notices/${body.approval_id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "Wire Console から差し戻し" }),
      });
      setActionMessage("差し戻しました");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deliver() {
    if (!body?.event_id || !body.peer_id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; delivery: { delivered: boolean; reason: string } }>(
        `/console/v1/tenants/${tenantId}/delivery/deliver`,
        {
          method: "POST",
          body: JSON.stringify({ peer_id: body.peer_id, event_id: body.event_id }),
        }
      );
      setActionMessage(
        res.delivery.delivered ? "相手組織へ送信しました" : "送信を待機しています"
      );
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function registerWitness(side: "sent" | "received") {
    if (!body?.event_id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        ok: boolean;
        quorum: { satisfied: boolean; matched: number; required: number };
      }>(`/console/v1/tenants/${tenantId}/witness/register`, {
        method: "POST",
        body: JSON.stringify({ event_id: body.event_id, side }),
      });
      setActionMessage(
        res.quorum.satisfied
          ? `公証を登録しました（${res.quorum.matched}/${res.quorum.required}）`
          : `公証を登録しました。残り ${res.quorum.required - res.quorum.matched} 件`
      );
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyWitness() {
    if (!body?.event_id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        ok: boolean;
        quorum: { satisfied: boolean; matched: number; required: number };
        receipts: { hub_id: string }[];
      }>(`/console/v1/tenants/${tenantId}/witness/verify`, {
        method: "POST",
        body: JSON.stringify({ event_id: body.event_id }),
      });
      setActionMessage(
        res.quorum.satisfied
          ? `公証は十分です（${res.quorum.matched}/${res.quorum.required}）`
          : `公証が不足しています（${res.quorum.matched}/${res.quorum.required}）`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="message-reader">
      <header className="reader-header">
        <h2>{body.subject}</h2>
        <span className={`status-pill tone-${body.status_tone}`}>{body.status_label}</span>
      </header>
      <dl className="reader-meta">
        <div>
          <dt>差出人</dt>
          <dd>{body.from_label}</dd>
        </div>
        <div>
          <dt>宛先</dt>
          <dd>{body.to_label}</dd>
        </div>
        <div>
          <dt>日時</dt>
          <dd>{formatWhen(body.recorded_at)}</dd>
        </div>
      </dl>
      <div className="reader-body">{body.body_text}</div>
      {body.workflow_summary.length ? (
        <ol className="reader-workflow">
          {body.workflow_summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      ) : null}
      <div className="reader-actions">
        {body.can_approve ? (
          <>
            <button type="button" disabled={busy} onClick={() => void approve()}>
              承認
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void reject()}>
              差し戻し
            </button>
          </>
        ) : null}
        {body.can_send ? (
          <button type="button" disabled={busy || !body.peer_id} onClick={() => void deliver()}>
            送信
          </button>
        ) : null}
        {body.can_witness ? (
          <>
            <button type="button" className="secondary" disabled={busy} onClick={() => void registerWitness("sent")}>
              公証を登録（送信側）
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void registerWitness("received")}
            >
              公証を登録（受信側）
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void verifyWitness()}>
              公証を確認
            </button>
          </>
        ) : null}
      </div>
      {actionMessage ? <p className="hint">{actionMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {body.event_id ? (
        <details className="technical-details">
          <summary>システム情報（開発者向け）</summary>
          {detailLoading ? <p className="hint">読み込み中…</p> : null}
          {eventDetail ? (
            <>
              <dl className="detail-meta">
                <dt>event_id</dt>
                <dd className="mono">{eventDetail.event_id}</dd>
                <dt>location</dt>
                <dd>{eventDetail.location}</dd>
                <dt>digest</dt>
                <dd className="mono" title={eventDetail.envelope_digest}>
                  {shortDigest(eventDetail.envelope_digest)}
                </dd>
              </dl>
              {workflow ? (
                <ol className="step-list">
                  {workflow.steps.map((step) => (
                    <li key={step.id} className={`step step-${step.status}`}>
                      <strong>{step.label}</strong>
                      <span className={`badge step-badge ${step.status}`}>{step.status}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
              <pre className="envelope-json">{JSON.stringify(eventDetail.envelope, null, 2)}</pre>
            </>
          ) : null}
        </details>
      ) : null}
    </aside>
  );
}
