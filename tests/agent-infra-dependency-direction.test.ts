import { describe, expect, it } from "vitest";
import { validateAgentInfraLayerCatalog } from "../src/lib/agents/layer-catalog.js";
import {
  collectAgentInfraHardRuleViolations,
  collectAgentInfraLayerViolationKeys,
  collectMissingKnownExternalCycleSeeds,
} from "../src/lib/agents/layer-dependency-scan.js";
import { AGENT_INFRA_LAYER_VIOLATION_BASELINE } from "../src/lib/agents/layer-violation-baseline.js";

describe("agent infra layer dependency direction", () => {
  it("assigns every in-scope implementation module to a layer", () => {
    expect(validateAgentInfraLayerCatalog()).toEqual([]);
  });

  it("does not grow the upward-dependency baseline", () => {
    const actual = collectAgentInfraLayerViolationKeys();
    const baseline = new Set(AGENT_INFRA_LAYER_VIOLATION_BASELINE);
    const novel = actual.filter((key) => !baseline.has(key));
    expect(novel).toEqual([]);
  });

  it("tracks current violations only as an explicit baseline", () => {
    const actual = new Set(collectAgentInfraLayerViolationKeys());
    const stale = AGENT_INFRA_LAYER_VIOLATION_BASELINE.filter((key) => !actual.has(key));
    expect(stale).toEqual([]);
  });

  it("enforces llm_pool / aia / reporting hard import rules", () => {
    expect(collectAgentInfraHardRuleViolations()).toEqual([]);
  });

  it("documents known external cycles via seed imports", () => {
    expect(collectMissingKnownExternalCycleSeeds()).toEqual([]);
  });
});
