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
            <h2 className="section-title">{data.story_title}</h2>
            <p className="page-desc muted">{data.story_lead}</p>
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
                  {step.href ? (
                    <a href={step.href}>
                      [{statusLabel(step.status, copy)}] {step.title}
                    </a>
                  ) : (
                    <span>
                      [{statusLabel(step.status, copy)}] {step.title}
                    </span>
                  )}
                  <p className="muted">{step.summary}</p>
                  {step.detail ? <p className="muted">{step.detail}</p> : null}
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

          <p className="muted">{data.cli_hint}</p>

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
