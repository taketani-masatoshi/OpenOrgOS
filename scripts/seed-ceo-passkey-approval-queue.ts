#!/usr/bin/env node
/**
 * Seed a pending tenant.config approval that requires iPhone Settlement PassKey.
 * Idempotent: skips when a pending privilege-increase change already exists.
 *
 * Usage:
 *   ORGOS_TENANT=mal npx tsx scripts/seed-ceo-passkey-approval-queue.ts
 */
import { buildAgentModuleInventory } from "../src/lib/steward-chat/agent-module-inventory.js";
import {
  isTenantConfigPrivilegeIncrease,
  listPendingTenantConfigChanges,
  proposeTenantConfigChange,
} from "../src/lib/org/tenant-config-change.js";
import { setTenantId, getTenantId } from "../src/lib/tenant.js";

function main(): void {
  const tenant = process.env.ORGOS_TENANT?.trim() || "mal";
  setTenantId(tenant);

  const existing = listPendingTenantConfigChanges().find(isTenantConfigPrivilegeIncrease);
  if (existing) {
    console.log(`Already pending: ${existing.approval_id} (${existing.message})`);
    console.log(`Open Operator Console → 承認 tab (/approvals/)`);
    return;
  }

  const agent = buildAgentModuleInventory().agents_available[0];
  if (!agent) {
    throw new Error(`No catalog agents available to propose for tenant ${getTenantId()}`);
  }

  const proposed = proposeTenantConfigChange({
    target: "agents",
    targetId: agent.id,
    enabled: true,
    proposedBy: process.env.ORGOS_OPERATOR_ID?.trim() || "seed-script",
    message: `PassKey 承認デモ — エージェント ${agent.label} を追加`,
  });

  console.log(`Proposed ${proposed.change.change_id}`);
  console.log(`  approval: ${proposed.approval_id}`);
  console.log(`  agent: ${agent.id} (${agent.label})`);
  console.log(`  PassKey: required when ORGOS_SETTLEMENT_STEPUP=1`);
  console.log(`Open Operator Console → 承認 tab (/approvals/)`);
}

main();
