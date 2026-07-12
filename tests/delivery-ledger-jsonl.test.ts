import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { getWireSentDir } from "../src/lib/correspondence/paths.js";
import {
  getEmailWireEventConfirmation,
  recordDeliveryAttempt,
  listDeliveryAttempts,
  resetDeliveryAttemptRepository,
} from "../src/lib/protocol/delivery-ledger.js";
import {
  getDeliveryAttemptsJsonlPath,
  getDeliveryAttemptsPath,
} from "../src/lib/protocol/paths.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
  resetDeliveryAttemptRepository();
}

describe("delivery-ledger append-only jsonl", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => cleanup());

  it("appends to jsonl and keeps derived yaml snapshot", () => {
    const recorded = recordDeliveryAttempt({
      event_id: "00000000-0000-4000-8000-000000000010",
      peer_id: "PEER-001",
      channel: "wire_v1",
      status: "success",
      endpoint: "https://example.test/wire",
    });
    expect(recorded.status).toBe("success");
    expect(existsSync(getDeliveryAttemptsJsonlPath())).toBe(true);
    expect(listDeliveryAttempts({ peerId: "PEER-001" })).toHaveLength(1);
    const lines = readFileSync(getDeliveryAttemptsJsonlPath(), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("bootstraps legacy yaml into jsonl before first append", () => {
    const yamlPath = getDeliveryAttemptsPath();
    mkdirSync(dirname(yamlPath), { recursive: true });
    writeFileSync(
      yamlPath,
      `attempts:
  - event_id: "00000000-0000-4000-8000-000000000011"
    peer_id: PEER-LEGACY
    channel: email_wire
    status: success
    at: "2026-01-01T00:00:00.000Z"
    direction: outbound
`,
      "utf-8"
    );
    recordDeliveryAttempt({
      event_id: "00000000-0000-4000-8000-000000000012",
      peer_id: "PEER-NEW",
      channel: "wire_v1",
      status: "failed",
      error: "timeout",
    });
    const all = listDeliveryAttempts();
    expect(all.some((a) => a.peer_id === "PEER-LEGACY")).toBe(true);
    expect(all.some((a) => a.peer_id === "PEER-NEW")).toBe(true);
  });

  it("rehydrates confirmation from wire-sent and inbox when ledger was wiped", () => {
    const eventId = "00000000-0000-4000-8000-000000000013";
    const sentDir = getWireSentDir();
    const inboxDir = join(getDocsDir(), "protocol", "inbox");
    mkdirSync(sentDir, { recursive: true });
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(sentDir, `${eventId}.eml`), "From: wire@test\n\nok\n", "utf-8");
    writeFileSync(
      join(inboxDir, `${eventId}.json`),
      JSON.stringify({ event_id: eventId }),
      "utf-8"
    );

    // Simulate concurrent Vitest fixture restore wiping delivery-attempts*.
    const jsonl = getDeliveryAttemptsJsonlPath();
    const yaml = getDeliveryAttemptsPath();
    if (existsSync(jsonl)) rmSync(jsonl, { force: true });
    if (existsSync(yaml)) rmSync(yaml, { force: true });
    resetDeliveryAttemptRepository();

    expect(getEmailWireEventConfirmation(eventId)).toMatchObject({
      event_id: eventId,
      state: "confirmed",
    });
    expect(listDeliveryAttempts({ eventId, channel: "email_wire" }).length).toBeGreaterThanOrEqual(
      2
    );
  });
});
