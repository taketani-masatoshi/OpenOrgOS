import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { DOCS_DIR } from "../src/lib/utils.js";
import { appendAuditEvent, listAuditEvents, auditLogPath } from "../src/lib/audit-log.js";

describe("audit log", () => {
  beforeEach(() => {
    setTenantId("demo");
    const p = auditLogPath();
    if (existsSync(p)) rmSync(p);
  });

  afterEach(() => {
    const p = auditLogPath();
    if (existsSync(p)) rmSync(p);
  });

  it("appends and lists events", () => {
    const e1 = appendAuditEvent({ event: "validate", ref: "ok" });
    const e2 = appendAuditEvent({ event: "handoff", ref: "HO-test", actor: "steward" });
    const events = listAuditEvents();
    expect(events.length).toBe(2);
    expect(events[0]?.id).toBe(e1.id);
    expect(events[1]?.event).toBe("handoff");
    expect(existsSync(join(DOCS_DIR, "reports", "audit-log", "audit.jsonl"))).toBe(true);
  });

  it("filters by event type", () => {
    appendAuditEvent({ event: "escalate", ref: "IMP-1" });
    appendAuditEvent({ event: "validate", ref: "ok" });
    expect(listAuditEvents({ event: "escalate" }).length).toBe(1);
  });
});
