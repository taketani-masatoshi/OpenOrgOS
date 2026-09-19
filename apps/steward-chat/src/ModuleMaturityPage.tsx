import { useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchModuleMaturityPanel,
  type CoreLane,
  type ModuleMaturityPanel,
  type ModuleMaturityRow,
} from "./api";

type Copy = ReturnType<typeof useCopy<typeof STEWARD_COPY.ja>>;

function tierLabel(tier: ModuleMaturityRow["tier"], copy: Copy): string {
  if (tier === "production_ready") return copy.maturityTierProduction;
  if (tier === "activation_ready") return copy.maturityTierActivation;
  return copy.maturityTierSkeleton;
}

function levelLabel(level: CoreLane["level"], copy: Copy): string {
  if (level === "closed") return copy.maturityLaneClosed;
  if (level === "operational") return copy.maturityLaneOperational;
  if (level === "thin") return copy.maturityLaneThin;
  return copy.maturityLaneMissing;
}

function laneLabel(key: string, copy: Copy): string {
  if (key === "lane.secretary") return copy.maturityLaneSecretary;
  if (key === "lane.mail") return copy.maturityLaneMail;
  if (key === "lane.task") return copy.maturityLaneTask;
  if (key === "lane.wire") return copy.maturityLaneWire;
  if (key === "lane.property") return copy.maturityLaneProperty;
  return key;
}

function laneSummary(key: string, copy: Copy): string {
  const map: Record<string, string> = {
    "secretary.missing": copy.maturitySumSecretaryMissing,
    "secretary.active": copy.maturitySumSecretaryActive,
    "secretary.idle": copy.maturitySumSecretaryIdle,
    "mail.missing": copy.maturitySumMailMissing,
    "mail.closed": copy.maturitySumMailClosed,
    "mail.active": copy.maturitySumMailActive,
    "mail.idle": copy.maturitySumMailIdle,
    "task.missing": copy.maturitySumTaskMissing,
    "task.closed": copy.maturitySumTaskClosed,
    "task.active": copy.maturitySumTaskActive,
    "task.idle": copy.maturitySumTaskIdle,
    "wire.missing": copy.maturitySumWireMissing,
    "wire.no_peers": copy.maturitySumWireNoPeers,
    "wire.active": copy.maturitySumWireActive,
    "wire.idle": copy.maturitySumWireIdle,
    "property.missing": copy.maturitySumPropertyMissing,
    "property.empty": copy.maturitySumPropertyEmpty,
    "property.active": copy.maturitySumPropertyActive,
    "property.idle": copy.maturitySumPropertyIdle,
  };
  return map[key] ?? key;
}

function riskLabel(row: ModuleMaturityRow, copy: Copy): string {
  if (row.risk_severity === "skeleton_enabled") return copy.maturityRiskSkeleton;
  if (row.risk_severity === "activation_enabled") return copy.maturityRiskActivation;
  return copy.maturityRiskBadge;
}

export function ModuleMaturityPage() {
  const copy = useCopy(STEWARD_COPY);
  const [data, setData] = useState<ModuleMaturityPanel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchModuleMaturityPanel()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <OpsPage
      title={copy.maturityTitle}
      lead={copy.maturityLead}
      error={error}
      loading={!data && !error}
    >
      {data ? (
        <>
          <p className="ops-page-meta">
            {data.tenant} · {data.report_date}
          </p>

          <section className="outlook-panel" aria-label={copy.maturitySummary}>
            <h2 className="section-title">{copy.maturitySummary}</h2>
            <div className="outlook-kpi summary-grid">
              <div>
                <span className="kpi-value">{data.summary.enabled}</span>
                <span className="kpi-label">{copy.maturityEnabled}</span>
              </div>
              <div>
                <span className="kpi-value">
                  {data.summary.enabled_production_ready}
                </span>
                <span className="kpi-label">{copy.maturityTierProduction}</span>
              </div>
              <div>
                <span className="kpi-value">
                  {data.summary.risk_skeleton_count}
                </span>
                <span className="kpi-label">{copy.maturityRiskSkeleton}</span>
              </div>
              <div>
                <span className="kpi-value">
                  {data.summary.risk_activation_count}
                </span>
                <span className="kpi-label">{copy.maturityRiskActivation}</span>
              </div>
            </div>
          </section>

          <section className="outlook-panel" aria-label={copy.maturityLanes}>
            <h2 className="section-title">{copy.maturityLanes}</h2>
            <p className="page-desc muted">{copy.maturityLanesLead}</p>
            <ul className="executive-work-list">
              {data.lanes.map((row) => (
                <li key={row.id}>
                  <a href={row.href}>
                    [{levelLabel(row.level, copy)}] {laneLabel(row.label_key, copy)}{" "}
                    — {laneSummary(row.summary_key, copy)}
                  </a>
                  <p className="muted">
                    {copy.maturitySurface}: {row.surface} · {copy.maturityLoad}:{" "}
                    {row.load === "active"
                      ? copy.maturityLoadActive
                      : copy.maturityLoadIdle}
                    {row.signals.length > 0
                      ? ` · ${row.signals.join(" · ")}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {data.risks.length > 0 ? (
            <section className="outlook-panel" aria-label={copy.maturityRisks}>
              <h2 className="section-title">{copy.maturityRisks}</h2>
              <p className="page-desc muted">{copy.maturityRisksLead}</p>
              <ul className="executive-work-list">
                {data.risks.map((row) => (
                  <li key={row.id}>
                    {row.href ? (
                      <a href={row.href}>
                        {row.label} ({row.id}) · {tierLabel(row.tier, copy)} ·{" "}
                        {riskLabel(row, copy)}
                      </a>
                    ) : (
                      <span>
                        {row.label} ({row.id}) · {tierLabel(row.tier, copy)} ·{" "}
                        {riskLabel(row, copy)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="outlook-panel" aria-label={copy.maturityModules}>
            <h2 className="section-title">{copy.maturityModules}</h2>
            <ul className="executive-work-list">
              {data.modules
                .filter((m) => m.installed || m.enabled)
                .map((row) => (
                  <li key={row.id}>
                    <span>
                      {row.label} · {tierLabel(row.tier, copy)}
                      {row.enabled ? "" : ` · ${copy.maturityOff}`}
                      {row.risk ? ` · ${riskLabel(row, copy)}` : ""}
                    </span>
                  </li>
                ))}
            </ul>
          </section>

          <p className="section-cta">
            <a className="btn btn-ghost btn-sm" href="/modules/">
              {copy.moduleList}
            </a>{" "}
            <a className="btn btn-ghost btn-sm" href="/secretary/workbench/">
              {copy.secretaryWorkbench}
            </a>{" "}
            <a className="btn btn-ghost btn-sm" href="/properties/">
              {copy.propertyOpsTitle}
            </a>
          </p>
        </>
      ) : null}
    </OpsPage>
  );
}
