import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getClassificationRegistryYaml } from "../src/lib/utils.js";
import { alignClassificationRegistry } from "../src/lib/classification-registry-align.js";
import { classificationRegistrySchema } from "../schemas/classification.js";

describe("align classification registry", () => {
  const backupPath = join(process.cwd(), "scratch/classification-align-test-backup.yaml");
  const demoRegistry = join(process.cwd(), "tenants/demo/data/classification-registry.yaml");

  beforeEach(() => {
    setTenantId("demo");
    mkdirSync(join(process.cwd(), "scratch"), { recursive: true });
    if (existsSync(demoRegistry)) {
      writeFileSync(backupPath, readFileSync(demoRegistry));
    }
  });

  afterEach(() => {
    if (existsSync(backupPath)) {
      writeFileSync(demoRegistry, readFileSync(backupPath));
      rmSync(backupPath);
    }
  });

  it("merges template resources into sparse registry", () => {
    writeFileSync(
      demoRegistry,
      YAML.stringify({
        version: "1",
        as_of: "2026-01-01",
        levels: {
          L0: { label: "公開", description: "公開", export_allowed: true },
          L1: { label: "社内", description: "社内", export_allowed: "conditional" },
          L2: { label: "機密", description: "機密", export_allowed: false },
          L3: { label: "禁止", description: "禁止", export_allowed: false },
        },
        agents: { finance: { label: "Finance", max_level: "L2", output_max_level: "L1" } },
        resources: [],
      }),
      "utf-8"
    );

    const result = alignClassificationRegistry({ tenantId: "demo" });
    expect(result.updated).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.addedResources).toContain("RES-PROTOCOL-PEERS");
    expect(result.addedAgents).toContain("secretary");

    const parsed = classificationRegistrySchema.parse(
      YAML.parse(readFileSync(demoRegistry, "utf-8"))
    );
    expect(parsed.resources.some((r) => r.id === "RES-PROTOCOL-PEERS")).toBe(true);
    expect(parsed.agents.finance).toBeDefined();
    expect(parsed.agents.secretary).toBeDefined();
  });

  it("dry-run does not write", () => {
    writeFileSync(
      demoRegistry,
      YAML.stringify({
        version: "1",
        as_of: "2026-01-01",
        levels: {
          L0: { label: "公開", description: "公開", export_allowed: true },
          L1: { label: "社内", description: "社内", export_allowed: "conditional" },
          L2: { label: "機密", description: "機密", export_allowed: false },
          L3: { label: "禁止", description: "禁止", export_allowed: false },
        },
        agents: {},
        resources: [],
      }),
      "utf-8"
    );
    const before = readFileSync(demoRegistry, "utf-8");
    const result = alignClassificationRegistry({ tenantId: "demo", dryRun: true });
    expect(result.updated).toBe(true);
    expect(readFileSync(demoRegistry, "utf-8")).toBe(before);
  });
});
