import type { AgentId } from "../../schemas/classification.js";
import type { ControlMaturity } from "../../schemas/control-framework.js";
import {
  computeControlGaps,
  controlsForAgent,
  formatControlStatusReport,
  initTenantControlsFile,
  listEffectiveControls,
  setTenantControlMaturity,
} from "../lib/control-framework.js";
import { setTenantId } from "../lib/tenant.js";

export interface ControlsOptions {
  tenant?: string;
  json?: boolean;
  iso?: string;
  agent?: string;
  strict?: boolean;
  id?: string;
  maturity?: string;
  notes?: string;
  dryRun?: boolean;
}

function applyTenant(opts: ControlsOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
}

export function runControlsList(opts: ControlsOptions = {}): void {
  applyTenant(opts);
  let controls = listEffectiveControls().filter((c) => c.in_scope);
  if (opts.iso) {
    controls = controls.filter((c) => c.iso_refs.some((r) => r.standard === opts.iso));
  }
  if (opts.agent) {
    controls = controls.filter(
      (c) => c.primary_agent === opts.agent || c.secondary_agents?.includes(opts.agent as AgentId)
    );
  }

  if (opts.json) {
    console.log(JSON.stringify(controls, null, 2));
    return;
  }

  console.log(`Controls in scope: ${controls.length}\n`);
  console.log("| ID | Domain | Maturity | Target | Agent | Title |");
  console.log("|----|--------|----------|--------|-------|-------|");
  for (const c of controls) {
    console.log(
      `| ${c.id} | ${c.domain} | ${c.tenant_maturity} | ${c.target_maturity} | ${c.primary_agent} | ${c.title} |`
    );
  }
}

export function runControlsStatus(opts: ControlsOptions = {}): void {
  applyTenant(opts);
  if (opts.json) {
    const controls = listEffectiveControls().filter((c) => c.in_scope);
    console.log(JSON.stringify({ controls, gaps: computeControlGaps() }, null, 2));
    return;
  }
  console.log(formatControlStatusReport());
}

export function runControlsGap(opts: ControlsOptions = {}): void {
  applyTenant(opts);
  const gaps = computeControlGaps();
  if (opts.json) {
    console.log(JSON.stringify(gaps, null, 2));
  } else {
    console.log(formatControlStatusReport());
  }
  const hasGaps = gaps.length > 0;
  if (hasGaps && opts.strict !== false) {
    process.exit(1);
  }
}

export function runControlsForAgent(agentId: string, opts: ControlsOptions = {}): void {
  applyTenant(opts);
  const controls = controlsForAgent(agentId as AgentId);
  if (opts.json) {
    console.log(JSON.stringify(controls, null, 2));
    return;
  }
  console.log(`Agent: ${agentId} — ${controls.length} control(s)\n`);
  for (const c of controls) {
    console.log(`- ${c.id} (${c.tenant_maturity}/${c.target_maturity}) — ${c.title}`);
  }
}

export function runControlsSet(opts: ControlsOptions): void {
  applyTenant(opts);
  if (!opts.id || !opts.maturity) {
    console.error('Usage: orgos controls set --id CTL-... --maturity L2 [--notes "..."]');
    process.exit(1);
  }
  setTenantControlMaturity({
    id: opts.id,
    maturity: opts.maturity as ControlMaturity,
    notes: opts.notes,
  });
  console.log(`✓ ${opts.id} → ${opts.maturity}`);
}

export function runControlsInit(opts: ControlsOptions = {}): void {
  applyTenant(opts);
  const { path, count } = initTenantControlsFile({ dryRun: opts.dryRun });
  if (opts.dryRun) {
    console.log(`Would write ${count} control(s) to ${path}`);
  } else {
    console.log(`✓ Initialized ${count} control(s) → ${path}`);
  }
}
