import { buildFleetHealthReport } from "./ledger-fleet-health.js";
import { buildBillingIssuesReport } from "./ledger-billing-issues.js";
import { loadSupportConfig } from "./ledger-support.js";

export type FleetMonitorSnapshot = {
  checked_at: string;
  healthy: boolean;
  fleet: ReturnType<typeof buildFleetHealthReport>;
  billing_issues: ReturnType<typeof buildBillingIssuesReport>;
  support: ReturnType<typeof loadSupportConfig>;
  alert_dry_run?: {
    would_post: boolean;
    webhook?: string;
    payload: unknown;
  };
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

function resolveAlertWebhook(input?: { alertWebhook?: string }): string | undefined {
  return (
    input?.alertWebhook?.trim() ||
    process.env.ORGOS_LEDGER_ALERT_WEBHOOK?.trim() ||
    loadSupportConfig().escalation_webhook ||
    undefined
  );
}

function buildAlertPayload(snapshot: FleetMonitorSnapshot, dryRun: boolean): unknown {
  return {
    ok: dryRun ? true : false,
    dry_run: dryRun || undefined,
    service: "orgos-ledger-fleet",
    checked_at: snapshot.checked_at,
    fleet: {
      healthy_count: snapshot.fleet.healthy_count,
      tenant_count: snapshot.fleet.tenant_count,
    },
    billing_issues: snapshot.billing_issues.issues,
  };
}

export async function runFleetMonitor(input?: {
  failOnUnhealthy?: boolean;
  alertWebhook?: string;
  /** Build (and optionally POST) a test alert even when the fleet is healthy. */
  alertDryRun?: boolean;
}): Promise<FleetMonitorSnapshot> {
  const snapshot = buildFleetMonitorSnapshot();
  const webhook = resolveAlertWebhook(input);

  if (input?.alertDryRun) {
    const payload = buildAlertPayload(snapshot, true);
    snapshot.alert_dry_run = {
      would_post: Boolean(webhook),
      webhook,
      payload,
    };
    // Only POST when a webhook is configured and the caller did not ask for
    // JSON-only inspection (CLI skips POST when --json is set by not passing
    // a flag — here we POST only if webhook exists and ORGOS_ALERT_DRY_RUN_POST=1
    // or when alertDryRun is used without json mode via CLI).
    if (webhook && process.env.ORGOS_ALERT_DRY_RUN_POST === "1") {
      await postLedgerAlertWebhook({ url: webhook, payload });
    }
    return snapshot;
  }

  if (webhook && !snapshot.healthy) {
    await postLedgerAlertWebhook({
      url: webhook,
      payload: buildAlertPayload(snapshot, false),
    });
  }
  if (input?.failOnUnhealthy && !snapshot.healthy) {
    throw new Error(
      `Fleet unhealthy: ${snapshot.fleet.healthy_count}/${snapshot.fleet.tenant_count} healthy`,
    );
  }
  return snapshot;
}
