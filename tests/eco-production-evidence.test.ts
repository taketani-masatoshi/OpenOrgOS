import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeEcoProductionEvidence,
  ECO_STRICT_CAP_BASE,
  ECO_STRICT_CAP_STEWARD_PUBLISH,
  ECO_STRICT_CAP_COMMUNITY,
  ECO_STRICT_CAP_FULL,
  ECO_READINESS_CAP_COMMUNITY,
  ECO_READINESS_CAP_FULL,
  resolveEcoStrictCap,
  resolveCommunityReadinessCap,
} from "../src/lib/protocol/eco-production-evidence.js";
import { exportCommunityProtocolBundle } from "../src/lib/protocol/community-export.js";
import { getInstallRoot } from "../src/lib/orgos-paths.js";

describe("eco production evidence (S-E5)", () => {
  const integrationPath = join(getInstallRoot(), "publish/protocol/community-integration.json");
  let backup: string | undefined;

  beforeEach(() => {
    if (existsSync(integrationPath)) {
      backup = readFileSync(integrationPath, "utf-8");
    }
  });

  afterEach(() => {
    if (backup !== undefined) {
      writeFileSync(integrationPath, backup, "utf-8");
    }
  });

  it("exportCommunityProtocolBundle writes publish/protocol files", () => {
    const result = exportCommunityProtocolBundle();
    expect(result.files).toContain("trusted-operators.yaml");
    expect(result.files).toContain("community-readiness.json");
    expect(result.files).toContain("community-sla.json");
    expect(existsSync(join(result.dest, "community-readiness.json"))).toBe(true);
  });

  it("resolveEcoStrictCap is at least STEWARD_PUBLISH after export", () => {
    exportCommunityProtocolBundle();
    const cap = resolveEcoStrictCap();
    expect(cap).toBeGreaterThanOrEqual(ECO_STRICT_CAP_STEWARD_PUBLISH);
  });

  it("raises cap to COMMUNITY when integration flags set", () => {
    exportCommunityProtocolBundle();
    writeFileSync(
      integrationPath,
      JSON.stringify({
        steward_export: true,
        community_ui: true,
        sla_dashboard: true,
        lifecycle_page: true,
        trusted_operators_page: true,
        governance_api: true,
        e2e_green: true,
      }),
      "utf-8"
    );
    const evidence = computeEcoProductionEvidence();
    expect(evidence.cap).toBe(ECO_STRICT_CAP_COMMUNITY);
    expect(evidence.ok).toBe(true);
  });

  it("raises cap to FULL when jurisdiction + vocabulary flags set", () => {
    exportCommunityProtocolBundle();
    writeFileSync(
      integrationPath,
      JSON.stringify({
        steward_export: true,
        community_ui: true,
        sla_dashboard: true,
        lifecycle_page: true,
        trusted_operators_page: true,
        governance_api: true,
        e2e_green: true,
        jurisdiction_registry_ui: true,
        vocabulary_i18n: true,
      }),
      "utf-8"
    );
    const evidence = computeEcoProductionEvidence();
    expect(evidence.cap).toBe(ECO_STRICT_CAP_FULL);
    expect(resolveCommunityReadinessCap()).toBe(ECO_READINESS_CAP_FULL);
  });

  it("base cap when integration missing", () => {
    if (existsSync(integrationPath)) rmSync(integrationPath);
    const evidence = computeEcoProductionEvidence();
    expect(evidence.cap).toBeLessThanOrEqual(ECO_STRICT_CAP_STEWARD_PUBLISH);
    expect(evidence.cap).toBeGreaterThanOrEqual(ECO_STRICT_CAP_BASE);
  });
});
