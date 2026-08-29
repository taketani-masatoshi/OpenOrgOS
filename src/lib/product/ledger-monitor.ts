import { buildFleetHealthReport } from "./ledger-fleet-health.js";
import { buildBillingIssuesReport } from "./ledger-billing-issues.js";
import { loadSupportConfig } from "./ledger-support.js";

export type FleetMonitorSnapshot = {
  checked_at: string;
  healthy: boolean;
  fleet: ReturnType<typeof buildFleetHealthReport>;
  billing_issues: ReturnType<typeof buildBillingIssuesReport>;
  support: ReturnType<typeof loadSupportConfig>;
};

export function buildFleetMonitorSnapshot(): FleetMonitorSnapshot {
  const fleet = buildFleetHealthReport();
  const billing_issues = buildBillingIssuesReport();
  const healthy =
    fleet.tenant_count > 0 &&
    fleet.healthy_count === fleet.tenant_count &&
    billing_issues.issues.filter((row) => row.issue === "past_due").length === 0;
  return {
    checked_at: new Date().toISOString(),
    healthy,
    fleet,
    billing_issues,
    support: loadSupportConfig(),
  };
}

export async function postLedgerAlertWebhook(input: {
  url: string;
  payload: unknown;
}): Promise<void> {
  const response = await fetch(input.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload),
  });
  if (!response.ok) {
    throw new Error(`Alert webhook failed (${response.status})`);
  }
}

export async function runFleetMonitor(input?: {
  failOnUnhealthy?: boolean;
  alertWebhook?: string;
}): Promise<FleetMonitorSnapshot> {
  const snapshot = buildFleetMonitorSnapshot();
  const webhook =
    input?.alertWebhook?.trim() ||
    process.env.ORGOS_LEDGER_ALERT_WEBHOOK?.trim() ||
    loadSupportConfig().escalation_webhook;
  if (webhook && !snapshot.healthy) {
    await postLedgerAlertWebhook({
      url: webhook,
      payload: {
        ok: false,
        service: "orgos-ledger-fleet",
        checked_at: snapshot.checked_at,
        fleet: {
          healthy_count: snapshot.fleet.healthy_count,
          tenant_count: snapshot.fleet.tenant_count,
        },
        billing_issues: snapshot.billing_issues.issues,
      },
    });
  }
  if (input?.failOnUnhealthy && !snapshot.healthy) {
    throw new Error(
      `Fleet unhealthy: ${snapshot.fleet.healthy_count}/${snapshot.fleet.tenant_count} healthy`,
    );
  }
  return snapshot;
}
