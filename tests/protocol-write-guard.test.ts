import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { writeOutboxEnvelope } from "../src/lib/protocol/audit-chain.js";
import { getProtocolOutboxDir } from "../src/lib/protocol/paths.js";
import {
  runWithProtocolWriteGuard,
  isProtocolWriteGuardDisabled,
} from "../src/lib/protocol/protocol-write-guard.js";
import { verifyOutboxProvenance } from "../src/lib/protocol/outbox-provenance.js";
import type { EventEnvelope } from "../schemas/protocol/org-event.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function sampleEnvelope(): EventEnvelope {
  return {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    origin: { org_id: "ORG-LOCAL", org_uri: "steward://tenant/demo" },
    identity: { org_ref: { org_id: "ORG-LOCAL" } },
    event: { type: "org.transaction.recorded", payload: { transaction_id: "TX-1" } },
    signature: null,
  };
}

describe("protocol write guard", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    delete process.env.STEWARD_PROTOCOL_WRITE_GUARD;
  });

  afterEach(() => cleanup());

  it("blocks writeOutboxEnvelope without guard", () => {
    mkdirSync(getProtocolOutboxDir(), { recursive: true });
    expect(() => writeOutboxEnvelope(sampleEnvelope(), getProtocolOutboxDir())).toThrow(
      /direct outbox file writes are blocked/
    );
  });

  it("allows writeOutboxEnvelope inside guard and writes provenance", () => {
    const envelope = sampleEnvelope();
    runWithProtocolWriteGuard("test", () => {
      writeOutboxEnvelope(envelope, getProtocolOutboxDir());
    });
    const check = verifyOutboxProvenance(getProtocolOutboxDir(), envelope);
    expect(check.ok).toBe(true);
  });

  it("can disable guard via env for migration", () => {
    process.env.STEWARD_PROTOCOL_WRITE_GUARD = "off";
    expect(isProtocolWriteGuardDisabled()).toBe(true);
    writeOutboxEnvelope(sampleEnvelope(), getProtocolOutboxDir());
  });
});
