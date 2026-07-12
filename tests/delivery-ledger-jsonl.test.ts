import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
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
});
