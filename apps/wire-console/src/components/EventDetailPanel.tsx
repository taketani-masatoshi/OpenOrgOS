import { useEffect, useState } from "react";
import { api, shortDigest, type EventDetail, type EventWorkflow } from "../api";

interface Props {
  tenantId: string;
  detail: EventDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function EventDetailPanel({ tenantId, detail, loading, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<"envelope" | "workflow">("envelope");
  const [workflow, setWorkflow] = useState<EventWorkflow | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  useEffect(() => {
    if (!detail?.event_id) {
      setWorkflow(null);
      return;
    }
    setWorkflowLoading(true);
    void api<EventWorkflow & { ok: boolean }>(
      `/console/v1/tenants/${tenantId}/events/${detail.event_id}/workflow`
    )
      .then((w) => setWorkflow(w))
      .catch(() => setWorkflow(null))
      .finally(() => setWorkflowLoading(false));
  }, [tenantId, detail?.event_id]);

  if (!detail && !loading) return null;

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <h3>Event detail</h3>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : detail ? (
        <>
          <div className="detail-tabs">
            <button
              type="button"
              className={tab === "envelope" ? "tab active" : "tab"}
              onClick={() => setTab("envelope")}
            >
              Envelope
            </button>
            <button
              type="button"
              className={tab === "workflow" ? "tab active" : "tab"}
              onClick={() => setTab("workflow")}
            >
              Workflow
            </button>
          </div>

          {tab === "envelope" ? (
            <>
              <dl className="detail-meta">
                <dt>tenant</dt>
                <dd>{tenantId}</dd>
                <dt>event_id</dt>
                <dd className="mono">{detail.event_id}</dd>
                <dt>location</dt>
                <dd>{detail.location}</dd>
                <dt>digest</dt>
                <dd className="mono" title={detail.envelope_digest}>
                  {detail.envelope_digest}
                </dd>
                <dt>recorded</dt>
                <dd>{detail.recorded_at}</dd>
                {detail.transaction ? (
                  <>
                    <dt>transaction</dt>
                    <dd>{detail.transaction.transaction_id}</dd>
                  </>
                ) : null}
                <dt>wire delivered</dt>
                <dd>{detail.wire_delivered ? "yes" : "no"}</dd>
                {detail.provenance ? (
                  <>
                    <dt>provenance</dt>
                    <dd>
                      {detail.provenance.source} · {detail.provenance.written_at}
                      <br />
                      <span className="mono">{shortDigest(detail.provenance.digest)}</span>
                    </dd>
                  </>
                ) : null}
              </dl>
              <pre className="envelope-json">{JSON.stringify(detail.envelope, null, 2)}</pre>
            </>
          ) : (
            <div className="workflow-steps">
              {workflowLoading ? <p>Loading workflow…</p> : null}
              {workflow ? (
                <>
                  <ol className="step-list">
                    {workflow.steps.map((step) => (
                      <li key={step.id} className={`step step-${step.status}`}>
                        <strong>{step.label}</strong>
                        <span className={`badge step-badge ${step.status}`}>{step.status}</span>
                        {step.detail ? <span className="step-detail">{step.detail}</span> : null}
                      </li>
                    ))}
                  </ol>
                  {workflow.approval_id ? (
                    <p className="hint mono">approval {workflow.approval_id}</p>
                  ) : null}
                  <button type="button" className="secondary" onClick={onRefresh}>
                    Refresh tenant
                  </button>
                </>
              ) : (
                <p className="hint">No workflow data</p>
              )}
            </div>
          )}
        </>
      ) : null}
    </aside>
  );
}
