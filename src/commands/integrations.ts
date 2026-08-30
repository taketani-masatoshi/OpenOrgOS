import { computeIntegrationsStatus } from "../lib/integrations-status.js";
import { getTenantId } from "../lib/tenant.js";
import {
  asanaIntegrationStatus,
  linkAsanaCase,
  pullAsanaCase,
  pushAsanaTarget,
} from "../lib/integrations/asana-adapter.js";
import { buildConnectorHubSnapshot } from "../lib/integrations/connector-hub.js";
import { sendConsoleSlackMessage } from "../lib/integrations/slack-connector.js";
import {
  exportToGoogleDrive,
  type DriveExportKind,
} from "../lib/integrations/gdrive-export.js";

export function runIntegrationsStatus(opts: { json?: boolean }): void {
  const report = computeIntegrationsStatus(getTenantId());
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Integrations status · ${report.tenant} · ${report.score_pct}%`);
  if (report.setup_completed_at) {
    console.log(`  setup completed: ${report.setup_completed_at}`);
  }
  console.log("");
  for (const item of report.items) {
    console.log(`  ${item.ok ? "✓" : "○"} ${item.id}: ${item.detail}`);
  }
}

export function runAsanaStatus(opts: { json?: boolean }): void {
  const status = asanaIntegrationStatus();
  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(
    `Asana · configured=${status.configured} · links=${status.links} · token=${status.token_source}`,
  );
}

export function runAsanaLink(opts: {
  caseId: string;
  taskGid: string;
  projectGid?: string;
  json?: boolean;
}): void {
  try {
    const link = linkAsanaCase({
      caseId: opts.caseId,
      taskGid: opts.taskGid,
      projectGid: opts.projectGid,
    });
    if (opts.json) {
      console.log(JSON.stringify(link, null, 2));
      return;
    }
    console.log(`✓ linked ${link.case_id} → task ${link.task_gid}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export async function runAsanaPush(opts: {
  caseId?: string;
  workOrderId?: string;
  taskId?: string;
  projectGid?: string;
  json?: boolean;
}): Promise<void> {
  const target = opts.workOrderId
    ? ({ kind: "work_order", id: opts.workOrderId } as const)
    : opts.taskId
      ? ({ kind: "executive_task", id: opts.taskId } as const)
      : opts.caseId
        ? ({ kind: "case", id: opts.caseId } as const)
        : null;
  if (!target) {
    console.error("--case, --work-order or --task required");
    process.exit(1);
    return;
  }

  const result = await pushAsanaTarget({ ...target, projectGid: opts.projectGid });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    console.error(`Asana push failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(`✓ Asana ${result.created ? "created" : "updated"} ${target.id} (${result.task_gid})`);
}

export function runConnectorStatus(opts: { json?: boolean }): void {
  const snapshot = buildConnectorHubSnapshot();
  if (opts.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log("Connectors");
  for (const c of snapshot.connectors) {
    const state = c.connected
      ? c.expired
        ? "connected (expired)"
        : "connected"
      : c.fallback_configured
        ? "fallback"
        : "not connected";
    const platform = c.platform_ready ? "" : " · platform not shipped";
    console.log(`  ${c.usable ? "✓" : "○"} ${c.label}: ${state}${platform}`);
  }
}

export async function runSlackSend(opts: {
  text: string;
  channel?: string;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  const result = await sendConsoleSlackMessage({
    text: opts.text,
    channel: opts.channel,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.sent && !result.dryRun) {
    console.error(`Slack send failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(result.dryRun ? `dry-run: ${result.reason}` : `✓ Slack sent (${result.transport})`);
}

export async function runDriveExport(opts: {
  kind: DriveExportKind;
  id?: string;
  folderId?: string;
  json?: boolean;
}): Promise<void> {
  const result = await exportToGoogleDrive({
    kind: opts.kind,
    id: opts.id,
    folderId: opts.folderId,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    console.error(`Drive export failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(`✓ Drive stored ${result.file_name} (${result.file_id})`);
}

export async function runAsanaPull(opts: { caseId: string; json?: boolean }): Promise<void> {
  const result = await pullAsanaCase(opts.caseId);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    console.error(`Asana pull failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(`✓ Asana pull ${opts.caseId}`);
  if (result.public_notes) {
    console.log(`  notes: ${result.public_notes.slice(0, 200)}`);
  }
}
