import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { appendAuditEvent } from "../src/lib/audit-log.js";
import {
  clearOrgAuditBridgeStateForTests,
  loadOrgAuditBridgeState,
  markAuditEventBridged,
} from "../src/lib/org/audit-bridge-state.js";
import { getOrgAuditBridgeStatePath } from "../src/lib/org/paths.js";
import { writeYamlFile } from "../src/lib/utils.js";
import {
  clearOrgAuditBridgeErrorsForTests,
  listRecentAuditBridgeFailures,
  recordAuditBridgeFailure,
} from "../src/lib/org/audit-bridge-errors.js";
import { ORG_AUDIT_BRIDGE_STATE_MAX_IDS } from "../schemas/org/audit-bridge-state.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "org"), join(getDataDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("org audit bridge P5", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => {
    cleanup();
    clearOrgAuditBridgeStateForTests();
    clearOrgAuditBridgeErrorsForTests();
  });

  it("rotates bridged_audit_ids when max exceeded", () => {
    const max = 3;
    writeYamlFile(getOrgAuditBridgeStatePath(), {
      bridged_audit_ids: [],
      max_bridged_ids: max,
    });
    for (let i = 0; i < max + 2; i++) {
      markAuditEventBridged(`AUD-rotate-${i}`);
    }
    const state = loadOrgAuditBridgeState();
    expect(state.bridged_audit_ids.length).toBe(max);
    expect(state.bridged_audit_ids[0]).toBe("AUD-rotate-2");
  });

  it("surfaces recorded bridge failures in validate warnings", () => {
    recordAuditBridgeFailure({
      auditId: "AUD-test",
      auditEvent: "validate",
      message: "simulated bridge error",
    });
    expect(listRecentAuditBridgeFailures().length).toBe(1);
    const validation = validateProtocolState({ standalone: true });
    expect(validation.warnings.some((w) => w.code === "audit-bridge-failed")).toBe(true);
  });

  it("appendAuditEvent records bridge failure without throwing", () => {
    const event = appendAuditEvent({ event: "handoff", ref: "HO-bridge" });
    expect(event.id).toMatch(/^AUD-/);
  });

  it("defaults max_bridged_ids to platform constant", () => {
    markAuditEventBridged("AUD-one");
    const state = loadOrgAuditBridgeState();
    expect(state.max_bridged_ids).toBe(ORG_AUDIT_BRIDGE_STATE_MAX_IDS);
  });
});
