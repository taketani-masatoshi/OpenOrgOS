import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { runTenantSetupWizard } from "../src/lib/tenant-setup-wizard.js";
import { loadIntegrations } from "../src/lib/integrations.js";

function cleanup(): void {
  const integrations = join(getDataDir(), "integrations");
  if (existsSync(integrations)) rmSync(integrations, { recursive: true, force: true });
}

describe("tenant setup wizard", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => cleanup());

  it("completes non-interactive setup with answers", async () => {
    const result = await runTenantSetupWizard({
      answers: {
        skip_executive: true,
        skip_operators: true,
        mail_provider: "dry_run",
        from_name: "Demo Corp",
        from_email: "secretary@demo.example",
      },
      nonInteractive: true,
      operatorId: "OP-TEST",
    });

    expect(result.integrations_path).toContain("integrations.yaml");
    const integrations = loadIntegrations();
    expect(integrations?.setup?.completed_at).toBeTruthy();
    expect(integrations?.setup?.completed_by).toBe("OP-TEST");
    expect(result.mail_config_path).toBeTruthy();
  });
});
