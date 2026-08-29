import { useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { useUiLocale } from "@ops-shared/useUiLocale";
import { dateTimeLocale } from "@ops-shared/locale";
import { approveWithSettlementCeremony } from "@ops-shared/settlement-stepup-client";
import { useSettlementStepUp } from "@ops-shared/use-settlement-stepup";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import { api, shortDigest, type EventDetail, type EventWorkflow, type HumanMessageBody } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  tenantId: string;
  messageId?: string;
  loading: boolean;
  body: HumanMessageBody | null;
  onRefresh: () => void;
}

function formatWhen(iso: string, locale: "ja" | "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(dateTimeLocale(locale), {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageReader({ tenantId, messageId, loading, body, onRefresh }: Props) {
  const copy = useCopy(WIRE_COPY);
  const locale = useUiLocale();
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [workflow, setWorkflow] = useState<EventWorkflow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [coApproverId, setCoApproverId] = useState("");
  const { runCeremony, modal } = useSettlementStepUp(api);

  useEffect(() => {
    setCoApproverId("");
  }, [body?.id]);

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
        <div className="empty-state">
          <strong>{copy.pickNotice}</strong>
          <p>{copy.pickNoticeHint}</p>
        </div>
      </aside>
    );
  }

  if (loading || !body) {
    return (
      <aside className="message-reader">
        <p className="hint">{copy.loading}</p>
      </aside>
    );
  }

  async function approve() {
    if (!body?.approval_id) return;
    if (body.co_approver_required && !coApproverId.trim()) {
      setError(copy.needCoApprover);
      return;
    }
    setBusy(true);
    setError(null);
    const coPayload = coApproverId.trim()
      ? { co_approver_id: coApproverId.trim() }
      : {};
    try {
      await approveWithSettlementCeremony({
        api,
        approvalId: body.approval_id,
        coApproverId: coApproverId.trim() || undefined,
        tryApprove: () =>
          api(`/console/v1/tenants/${tenantId}/notices/${body.approval_id}/approve`, {
            method: "POST",
            body: JSON.stringify(coPayload),
          }),
        runCeremony,
      });
      setActionMessage(copy.approved);
      onRefresh();
    } catch (err) {
      setError(webauthnUserMessage(err));
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
        body: JSON.stringify({ reason: copy.rejectReason }),
      });
      setActionMessage(copy.rejected);
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
        res.delivery.delivered ? copy.delivered : copy.deliverWaiting
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
          ? copy.witnessOk(res.quorum.matched, res.quorum.required)
          : copy.witnessPartial(res.quorum.required - res.quorum.matched)
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
          ? copy.witnessEnough(res.quorum.matched, res.quorum.required)
          : copy.witnessShort(res.quorum.matched, res.quorum.required)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {modal}
    <aside className="message-reader">
      <header className="reader-header">
        <h2>{body.subject}</h2>
        <span className={`status-pill tone-${body.status_tone}`}>{body.status_label}</span>
      </header>
      <dl className="reader-meta">
        <div>
          <dt>{copy.from}</dt>
          <dd>{body.from_label}</dd>
        </div>
        <div>
          <dt>{copy.to}</dt>
          <dd>{body.to_label}</dd>
        </div>
        <div>
          <dt>{copy.when}</dt>
          <dd>{formatWhen(body.recorded_at, locale)}</dd>
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
        {body.co_approver_required ? (
          <label className="reader-co-approver">
            <span>{copy.coApprover}</span>
            <select
              value={coApproverId}
              disabled={busy}
              onChange={(e) => setCoApproverId(e.target.value)}
            >
              <option value="">{copy.selectPlease}</option>
              {(body.co_approver_candidates ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {body.can_approve ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (body.co_approver_required && !coApproverId.trim())}
              onClick={() => void approve()}
            >
              {copy.approve}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reject()}>
              {copy.reject}
            </button>
          </>
        ) : null}
        {body.can_send ? (
          <button type="button" className="btn btn-primary" disabled={busy || !body.peer_id} onClick={() => void deliver()}>
            {copy.send}
          </button>
        ) : null}
        {body.can_witness ? (
          <>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void registerWitness("sent")}>
              {copy.witnessSent}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void registerWitness("received")}
            >
              {copy.witnessReceived}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void verifyWitness()}>
              {copy.witnessVerify}
            </button>
          </>
        ) : null}
      </div>
      {actionMessage ? <p className="hint">{actionMessage}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {body.event_id ? (
        <details className="technical-details">
          <summary>{copy.systemInfo}</summary>
          {detailLoading ? <p className="hint">{copy.loading}</p> : null}
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
    </>
  );
}
