import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { enqueueWirePending, archiveWirePending, listWirePending } from "../src/lib/protocol/wire-queue.js";
import { getWirePendingLifecyclePath } from "../src/lib/protocol/wire-pending-lifecycle.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

describe("wire pending lifecycle archive", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => cleanup());

  it("archiveWirePending appends lifecycle jsonl before removing active pending", () => {
    enqueueWirePending({
      peer_id: "PEER-001",
      event_id: "00000000-0000-4000-8000-000000000001",
      envelope_digest: "a".repeat(64),
    });
    expect(listWirePending()).toHaveLength(1);

    archiveWirePending("PEER-001", "00000000-0000-4000-8000-000000000001", "delivered");
    expect(listWirePending()).toHaveLength(0);

    const lifecyclePath = getWirePendingLifecyclePath();
    expect(existsSync(lifecyclePath)).toBe(true);
    const record = JSON.parse(readFileSync(lifecyclePath, "utf-8").trim().split("\n")[0]!);
    expect(record.reason).toBe("delivered");
    expect(record.entry.peer_id).toBe("PEER-001");
  });
});
