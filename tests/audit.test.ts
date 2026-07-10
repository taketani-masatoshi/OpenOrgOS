import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { appendAuditEvent, listAuditEvents, auditLogPath } from "../src/lib/audit-log.js";
import { clearOrgAuditBridgeStateForTests } from "../src/lib/org/audit-bridge-state.js";

function cleanupAuditSideEffects(): void {
  for (const p of [
    join(getDataDir(), "org"),
    join(getDataDir(), "protocol"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("audit log", () => {
  beforeEach(() => {
    delete process.env.ORGOS_AUDIT_LOG;
    delete process.env.ORGOS_AUDIT_TENANT;
    setTenantId("demo");
    const p = auditLogPath();
    if (existsSync(p)) rmSync(p);
    cleanupAuditSideEffects();
  });

  afterEach(() => {
    const p = auditLogPath();
    if (existsSync(p)) rmSync(p);
    cleanupAuditSideEffects();
    clearOrgAuditBridgeStateForTests();
  });

  it("appends and lists events", () => {
    const e1 = appendAuditEvent({ event: "validate", ref: "ok" });
    const e2 = appendAuditEvent({ event: "handoff", ref: "HO-test", actor: "steward" });
    const events = listAuditEvents();
    expect(events.length).toBe(2);
    expect(events[0]?.id).toBe(e1.id);
    expect(events[1]?.event).toBe("handoff");
    expect(existsSync(join(getDocsDir(), "reports", "audit-log", "audit.jsonl"))).toBe(true);
  });

  it("filters by event type", () => {
    appendAuditEvent({ event: "escalate", ref: "IMP-1" });
    appendAuditEvent({ event: "validate", ref: "ok" });
    expect(listAuditEvents({ event: "escalate" }).length).toBe(1);
  });

  it("tags vitest audit events with ORGOS_AUDIT_TENANT when set", () => {
    process.env.ORGOS_AUDIT_TENANT = "_orgos_test";
    const event = appendAuditEvent({ event: "validate", ref: "tenant-tag" });
    expect(event.tenant).toBe("_orgos_test");
  });
});
