import { computeIntegrationsStatus } from "../lib/integrations-status.js";
import { getTenantId } from "../lib/tenant.js";
import {
  asanaIntegrationStatus,
  linkAsanaCase,
  pushAsanaCase,
  pullAsanaCase,
} from "../lib/integrations/asana-adapter.js";

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

export async function runAsanaPush(opts: { caseId: string; json?: boolean }): Promise<void> {
  const result = await pushAsanaCase(opts.caseId);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    console.error(`Asana push failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(`✓ Asana push ${opts.caseId}`);
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
