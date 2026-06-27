import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { appendAuditEvent, listAuditEvents } from "../src/lib/audit-log.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { getOrgAuditBridgeConfigPath } from "../src/lib/org/paths.js";
import { bridgeAuditEventToProtocolChain } from "../src/lib/org/audit-bridge.js";
import { clearOrgAuditBridgeStateForTests } from "../src/lib/org/audit-bridge-state.js";
import { ORG_AUDIT_BRIDGE_EVENT_TYPES } from "../schemas/org/audit-bridge.js";
import { auditEventSchema, type AuditEventType } from "../schemas/audit-log.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org"),
    join(getDataDir(), "protocol"),
    join(getDocsDir(), "reports", "audit-log"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("org audit bridge", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "org"), { recursive: true });
    writeFileSync(getOrgAuditBridgeConfigPath(), "enabled: true\nevents: []\n", "utf-8");
  });

  afterEach(() => {
    cleanup();
    clearOrgAuditBridgeStateForTests();
  });

  it("bridges all operational audit event types with operational.recorded payload", () => {
    for (const eventType of ORG_AUDIT_BRIDGE_EVENT_TYPES as AuditEventType[]) {
      const audit = auditEventSchema.parse({
        id: `AUD-test-${eventType}`,
        timestamp: new Date().toISOString(),
        tenant: "demo",
        event: eventType,
        ref: `REF-${eventType}`,
        actor: "secretary",
        detail: `bridge test ${eventType}`,
      });
      const envelope = bridgeAuditEventToProtocolChain(audit);
      expect(envelope?.event.type).toBe("org.audit.attested");
      expect(envelope?.event.payload).toMatchObject({
        scope: "internal",
        kind: "operational.recorded",
        subject_type: `operational.${eventType}`,
      });
    }
  });

  it("appendAuditEvent mirrors to audit-chain when enabled", () => {
    appendAuditEvent({ event: "escalate", ref: "WO-001", actor: "secretary", detail: "test bridge" });
    expect(loadProtocolAuditChain().length).toBe(1);
  });

  it("does not duplicate bridge records for the same audit id", () => {
    const audit = auditEventSchema.parse({
      id: "AUD-idempotent-bridge",
      timestamp: new Date().toISOString(),
      tenant: "demo",
      event: "escalate",
      ref: "WO-IDEM",
      actor: "secretary",
      detail: "idempotency test",
    });
    const first = bridgeAuditEventToProtocolChain(audit);
    const second = bridgeAuditEventToProtocolChain(audit);
    expect(first?.event_id).toBeTruthy();
    expect(second).toBeNull();
    expect(loadProtocolAuditChain().length).toBe(1);
  });

  it("respects events filter when not bridging all types", () => {
    writeFileSync(
      getOrgAuditBridgeConfigPath(),
      "enabled: true\nevents:\n  - escalate\n  - handoff\n",
      "utf-8"
    );
    appendAuditEvent({ event: "escalate", ref: "E-1" });
    appendAuditEvent({ event: "validate", ref: "V-1" });
    appendAuditEvent({ event: "handoff", ref: "H-1" });
    expect(loadProtocolAuditChain().length).toBe(2);
    expect(listAuditEvents().length).toBe(3);
  });
});
