import { useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchWireDemoWalkthrough,
  type WireDemoStep,
  type WireDemoWalkthrough,
} from "./api";

type Copy = ReturnType<typeof useCopy<typeof STEWARD_COPY.ja>>;

function statusLabel(status: WireDemoStep["status"], copy: Copy): string {
  if (status === "ready") return copy.wireDemoReady;
  if (status === "pending") return copy.wireDemoPending;
  if (status === "missing") return copy.wireDemoMissing;
  return copy.wireDemoInfo;
}

function stepTitle(id: string, copy: Copy): string {
  if (id === "peer") return copy.wireDemoStepPeer;
  if (id === "propose") return copy.wireDemoStepPropose;
  if (id === "approve") return copy.wireDemoStepApprove;
  if (id === "deliver") return copy.wireDemoStepDeliver;
  if (id === "ack") return copy.wireDemoStepAck;
  return id;
}

function stepSummary(summary: string, copy: Copy): string {
  if (summary.startsWith("registered:")) {
    const parts = summary.split(":");
    return copy.wireDemoSummaryRegistered(parts[1] ?? "", parts[2] ?? "");
  }
  if (summary.startsWith("approvals_pending:")) {
    return copy.wireDemoSummaryApprovals(Number(summary.split(":")[1] ?? 0));
  }
  if (summary.startsWith("wire_pending:")) {
    return copy.wireDemoSummaryWirePending(Number(summary.split(":")[1] ?? 0));
  }
  const map: Record<string, string> = {
    missing_peer: copy.wireDemoSummaryMissingPeer,
    gateway_ready: copy.wireDemoSummaryGatewayReady,
    gateway_missing: copy.wireDemoSummaryGatewayMissing,
    approvals_idle: copy.wireDemoSummaryApprovalsIdle,
    wire_idle: copy.wireDemoSummaryWireIdle,
    witness_ready: copy.wireDemoSummaryWitnessReady,
    witness_missing: copy.wireDemoSummaryWitnessMissing,
  };
  return map[summary] ?? summary;
}

function stepDetail(detail: string | undefined, copy: Copy): string | null {
  if (!detail) return null;
  const map: Record<string, string> = {
    delivery_ok: copy.wireDemoDetailDeliveryOk,
    delivery_missing: copy.wireDemoDetailDeliveryMissing,
    peer_cli_hint: copy.wireDemoDetailPeerCli,
    propose_via_secretary: copy.wireDemoDetailProposeSecretary,
    need_gateway: copy.wireDemoDetailNeedGateway,
    approvals_wire_scope: copy.wireDemoDetailApprovals,
    flush_via_wire: copy.wireDemoDetailFlush,
    seed_cli_destructive: copy.wireDemoDetailSeed,
  };
  return map[detail] ?? detail;
}

export function WireDemoPage() {
  const copy = useCopy(STEWARD_COPY);
  const [data, setData] = useState<WireDemoWalkthrough | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchWireDemoWalkthrough()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <OpsPage
      title={copy.wireDemoTitle}
      lead={copy.wireDemoLead}
      error={error}
      loading={!data && !error}
    >
      {data ? (
        <>
          <p className="ops-page-meta">
            {data.tenant} · {data.report_date} · {data.counterparty}
          </p>

          <section className="outlook-panel">
            <h2 className="section-title">{copy.wireDemoStoryTitle}</h2>
            <p className="page-desc muted">{copy.wireDemoStoryLead}</p>
            <div className="outlook-kpi summary-grid">
              <div>
                <span className="kpi-value">{data.peers.length}</span>
                <span className="kpi-label">{copy.wireDemoPeers}</span>
              </div>
              <div>
                <span className="kpi-value">{data.approvals_pending_count}</span>
                <span className="kpi-label">{copy.wireDemoApprovals}</span>
              </div>
              <div>
                <span className="kpi-value">{data.wire_pending_count}</span>
                <span className="kpi-label">{copy.wireDemoPendingCount}</span>
              </div>
            </div>
          </section>

          <section className="outlook-panel" aria-label={copy.wireDemoSteps}>
            <h2 className="section-title">{copy.wireDemoSteps}</h2>
            <ol className="executive-work-list">
              {data.steps.map((step) => (
                <li key={step.id}>
                  <p>
                    [{statusLabel(step.status, copy)}] {stepTitle(step.id, copy)}
                  </p>
                  <p className="muted">{stepSummary(step.summary, copy)}</p>
                  {stepDetail(step.detail, copy) ? (
                    <p className="muted">{stepDetail(step.detail, copy)}</p>
                  ) : null}
                  {step.href ? (
                    <p className="section-cta">
                      <a className="btn btn-primary btn-sm" href={step.href}>
                        {copy.wireDemoOpenNext}
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          {data.peers.length > 0 ? (
            <section className="outlook-panel">
              <h2 className="section-title">{copy.wireDemoPeers}</h2>
              <ul className="executive-work-list">
                {data.peers.map((p) => (
                  <li key={p.peer_id}>
                    {p.display_name} ({p.peer_id})
                    {p.has_delivery_path
                      ? ` · ${copy.wireDemoDeliveryOk}`
                      : ` · ${copy.wireDemoDeliveryMissing}`}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <details className="advanced-panel">
            <summary>{copy.wireDemoCliSummary}</summary>
            <p className="muted">{copy.wireDemoCliHint}</p>
          </details>

          <p className="section-cta">
            <a className="btn btn-primary btn-sm" href={data.wire_console_href}>
              {copy.wireDemoOpenWire}
            </a>{" "}
            <a className="btn btn-ghost btn-sm" href={data.approvals_href}>
              {copy.wireDemoOpenApprovals}
            </a>{" "}
            <a className="btn btn-ghost btn-sm" href="/modules/maturity/">
              {copy.maturityNav}
            </a>
          </p>
        </>
      ) : null}
    </OpsPage>
  );
}
