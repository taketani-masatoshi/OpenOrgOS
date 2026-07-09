import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { computeIntegrationsStatus } from "../src/lib/integrations-status.js";
import { saveIntegrations } from "../src/lib/integrations.js";

describe("integrations status", () => {
  beforeEach(() => {
    setTenantId("demo");
    const intPath = join(getDataDir(), "integrations");
    if (existsSync(intPath)) rmSync(intPath, { recursive: true, force: true });
  });

  afterEach(() => {
    const intPath = join(getDataDir(), "integrations");
    if (existsSync(intPath)) rmSync(intPath, { recursive: true, force: true });
  });

  it("reports setup incomplete when integrations missing", () => {
    const report = computeIntegrationsStatus("demo");
    expect(report.setup_completed).toBe(false);
    expect(report.items.some((i) => i.id === "integrations_file")).toBe(true);
  });

  it("reports setup complete when stamp present", () => {
    saveIntegrations({
      version: "1",
      setup: { completed_at: "2026-07-09T00:00:00.000Z", completed_by: "OP-001" },
      webhooks: [],
    });
    const report = computeIntegrationsStatus("demo");
    expect(report.setup_completed).toBe(true);
  });
});
