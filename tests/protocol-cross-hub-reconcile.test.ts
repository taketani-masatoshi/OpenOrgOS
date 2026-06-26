import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir } from "../src/lib/utils.js";
import { reconcileCrossHub } from "../src/lib/protocol/witness-reconcile.js";

function cleanupProtocol(): void {
  const p = join(getDataDir(), "protocol");
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

describe("cross-hub reconcile", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanupProtocol();
  });

  afterEach(() => cleanupProtocol());

  it("returns warning when witness pool disabled", async () => {
    const result = await reconcileCrossHub();
    expect(result.checked).toBe(0);
    expect(result.alerts.some((a) => a.code === "witness-disabled")).toBe(true);
  });
});
