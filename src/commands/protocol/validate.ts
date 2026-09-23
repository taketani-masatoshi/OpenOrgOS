/** Validate, outbox permissions, audit, and envelope command handlers. */
import { applyProtocolTenant } from "./shared.js";
import {
  validateProtocolState,
  validateProtocolFile,
} from "../../lib/protocol/core/validate.js";
import {
  applyProtocolOutboxPermissions,
  checkProtocolOutboxPermissionsLoose,
} from "../../lib/protocol/core/outbox-permissions.js";
import { verifyProtocolAuditChain } from "../../lib/protocol/core/audit-chain.js";
import { verifyAuditChainExternal } from "../../lib/protocol/core/external-verify.js";
import { mapQueueEventToOrgEvent } from "../../lib/protocol/adapters/map-internal.js";
import { loadProtocolRegistry } from "../../lib/protocol/distribution/registry.js";
import { loadQueueEvents } from "../../lib/queue-db.js";


export interface ProtocolValidateOptions {
  tenant?: string;
  json?: boolean;
  standalone?: boolean;
}

export function runProtocolValidate(opts: ProtocolValidateOptions): void {
  applyProtocolTenant(opts.tenant);
  const result = validateProtocolState({ standalone: opts.standalone });
  if (opts.json) {
    console.log(JSON.stringify({ ...result, mode: opts.standalone ? "standalone" : "full" }, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`✓ Protocol state OK${opts.standalone ? " (standalone)" : ""}`);
    if (result.warnings.length) {
      console.log(`  warnings (${result.warnings.length}):`);
      for (const w of result.warnings) {
        console.log(`    [${w.code}] ${w.message}`);
      }
      if (result.warnings.some((w) => w.code === "witness-receipt-missing")) {
        console.log(
          "  hint: orgos protocol witness cache-missing · or protocol transaction prune-orphans [--apply]"
        );
      }
    }
    const registry = loadProtocolRegistry();
    console.log(`  protocol_version: ${registry.protocol_version}`);
    console.log(`  core_event_types: ${registry.core_event_types.length}`);
    return;
  }
  console.error("✗ Protocol validation failed:");
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolOutboxApplyPermissionsOptions {
  tenant?: string;
  user?: string;
  group?: string;
  dryRun?: boolean;
  json?: boolean;
}

export function runProtocolOutboxApplyPermissions(opts: ProtocolOutboxApplyPermissionsOptions): void {
  applyProtocolTenant(opts.tenant);
  const result = applyProtocolOutboxPermissions({
    user: opts.user,
    group: opts.group,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("✓ Protocol outbox permissions applied");
  for (const path of result.applied) {
    console.log(`  ${path}`);
  }
  if (result.skippedChown) {
    console.log("  chown skipped (run as root or via deploy/protocol-outbox/apply-permissions.sh with sudo)");
  }
}

export function runProtocolOutboxCheckPermissions(opts: {
  tenant?: string;
  json?: boolean;
}): void {
  applyProtocolTenant(opts.tenant);
  const issues = checkProtocolOutboxPermissionsLoose();
  if (opts.json) {
    console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    return;
  }
  if (issues.length === 0) {
    console.log("✓ Protocol outbox/inbox permissions OK");
    return;
  }
  console.error("✗ Protocol directory permissions:");
  for (const issue of issues) {
    console.error(`  [${issue.code}] ${issue.message} (${issue.path})`);
  }
  process.exit(1);
}

export interface ProtocolVerifyAuditChainOptions {
  chain?: string;
  envelopeDir?: string[];
  since?: string;
  requireEnvelopes?: boolean;
  tenant?: string;
  json?: boolean;
}

export function runProtocolVerifyAuditChain(opts: ProtocolVerifyAuditChainOptions): void {
  applyProtocolTenant(opts.tenant);
  runProtocolAuditVerify({
    since: opts.since,
    json: opts.json,
    tenant: opts.tenant,
    withEnvelopes: true,
    requireEnvelopes: opts.requireEnvelopes,
    chainPath: opts.chain,
    envelopeDir: opts.envelopeDir,
  });
}

export interface ProtocolAuditVerifyOptions {
  since?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolAuditVerify(opts: ProtocolAuditVerifyOptions & {
  withEnvelopes?: boolean;
  requireEnvelopes?: boolean;
  chainPath?: string;
  envelopeDir?: string[];
}): void {
  applyProtocolTenant(opts.tenant);

  if (opts.withEnvelopes || opts.requireEnvelopes || opts.chainPath || opts.envelopeDir?.length) {
    const result = verifyAuditChainExternal({
      chainPath: opts.chainPath,
      envelopeDirs: opts.envelopeDir,
      since: opts.since,
      requireEnvelopes: opts.requireEnvelopes,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.ok) {
      console.log(
        `✓ Audit chain OK (${result.checked} records · ${result.envelopesLoaded} envelope(s))`
      );
      for (const warning of result.warnings) {
        console.log(`  warn: ${warning.message}`);
      }
      return;
    }
    console.error("✗ Audit chain issues:");
    for (const issue of result.issues) {
      console.error(`  ${issue.audit_id}: ${issue.message}`);
    }
    for (const warning of result.warnings) {
      console.error(`  warn: ${warning.message}`);
    }
    process.exit(1);
  }

  const result = verifyProtocolAuditChain({ since: opts.since });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`✓ Audit chain OK (${result.checked} records)`);
    return;
  }
  console.error("✗ Audit chain issues:");
  for (const issue of result.issues) {
    console.error(`  ${issue.audit_id}: ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolMapInternalOptions {
  queueId?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolMapInternal(opts: ProtocolMapInternalOptions): void {
  applyProtocolTenant(opts.tenant);
  const events = loadQueueEvents();
  const target = opts.queueId
    ? events.find((e) => e.id === opts.queueId)
    : events[events.length - 1];
  if (!target) {
    console.error("No queue events found");
    process.exit(1);
  }
  const orgEvent = mapQueueEventToOrgEvent(target);
  if (opts.json) {
    console.log(JSON.stringify(orgEvent, null, 2));
    return;
  }
  console.log(`Queue ${target.id} → OrgEvent type: ${orgEvent.type}`);
}

export interface ProtocolEnvelopeValidateOptions {
  file: string;
}

export function runProtocolEnvelopeValidate(opts: ProtocolEnvelopeValidateOptions): void {
  const result = validateProtocolFile(opts.file, "envelope");
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log("✓ EventEnvelope valid");
}

