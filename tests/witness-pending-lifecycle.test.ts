import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  enqueueWitnessPending,
  archiveWitnessPending,
  listWitnessPending,
} from "../src/lib/protocol/witness-queue.js";
import { getWitnessPendingLifecyclePath } from "../src/lib/protocol/witness-pending-lifecycle.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

describe("witness pending lifecycle archive", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => cleanup());

  it("archiveWitnessPending appends lifecycle jsonl before removing active pending", () => {
    enqueueWitnessPending({
      hub_id: "HUB-001",
      event_id: "00000000-0000-4000-8000-000000000002",
      side: "sent",
      envelope_digest: "c".repeat(64),
    });
    expect(listWitnessPending()).toHaveLength(1);

    archiveWitnessPending(
      "HUB-001",
      "00000000-0000-4000-8000-000000000002",
      "sent",
      "attested"
    );
    expect(listWitnessPending()).toHaveLength(0);

    const lifecyclePath = getWitnessPendingLifecyclePath();
    expect(existsSync(lifecyclePath)).toBe(true);
    const record = JSON.parse(readFileSync(lifecyclePath, "utf-8").trim().split("\n")[0]!);
    expect(record.reason).toBe("attested");
    expect(record.entry.hub_id).toBe("HUB-001");
    expect(record.entry.side).toBe("sent");
  });

  it("removeWitnessPending archives with reason removed (compat)", async () => {
    enqueueWitnessPending({
      hub_id: "HUB-002",
      event_id: "00000000-0000-4000-8000-000000000003",
      side: "received",
      envelope_digest: "d".repeat(64),
    });
    const { removeWitnessPending } = await import("../src/lib/protocol/witness-queue.js");
    removeWitnessPending("HUB-002", "00000000-0000-4000-8000-000000000003", "received");
    expect(listWitnessPending()).toHaveLength(0);
    const record = JSON.parse(
      readFileSync(getWitnessPendingLifecyclePath(), "utf-8").trim().split("\n")[0]!
    );
    expect(record.reason).toBe("removed");
  });
});
