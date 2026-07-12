import { beforeEach, describe, it, expect } from "vitest";
import {
  loadDependencyGraph,
  computeImpact,
  resolveSourceNodes,
  findStaleDependencies,
} from "../src/lib/dependency-graph.js";
import { dependencyGraphSchema } from "../schemas/dependency-graph.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("dependency-graph", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads and validates dependency-graph.yaml", () => {
    const graph = loadDependencyGraph();
    expect(dependencyGraphSchema.parse(graph)).toEqual(graph);
    expect(graph.version).toBe("1");
    expect(graph.nodes.length).toBeGreaterThan(20);
    expect(graph.edges.length).toBeGreaterThan(30);
  });

  it("resolves CTR-008 contract file to nodes", () => {
    const graph = loadDependencyGraph();
    const nodes = resolveSourceNodes(graph, "data/contracts/CTR-008.yaml");
    expect(nodes.some((n) => n.id === "data/contracts/CTR-008.yaml")).toBe(true);
  });

  it("impact from CTR-008 includes loans.yaml and contract CSV", () => {
    const graph = loadDependencyGraph();
    const { sources, impacts } = computeImpact(graph, "data/contracts/CTR-008.yaml");

    expect(sources.length).toBeGreaterThan(0);
    const targetIds = impacts.map((i) => i.nodeId);
    expect(targetIds).toContain("data/finance/loans.yaml");
    expect(targetIds).toContain("docs/exports/契約管理表.csv");
  });

  it("impact from CTR-009 includes acquisition_price and LOAN-002 chain", () => {
    const graph = loadDependencyGraph();
    const { impacts } = computeImpact(graph, "CTR-009");
    const targetIds = impacts.map((i) => i.nodeId);
    expect(targetIds).toContain("data/finance/loans.yaml");
    expect(targetIds).toContain("PROP-002.acquisition_price");
  });

  it("impact from PROP-002 operating_costs reaches yojitsu expense", () => {
    const graph = loadDependencyGraph();
    const { impacts } = computeImpact(graph, "data/properties/PROP-002.yaml");
    const targetIds = impacts.map((i) => i.nodeId);
    expect(targetIds).toContain("data/finance/loans.yaml");
    expect(
      targetIds.some(
        (id) => id.includes("yojitsu") || id.includes("expense") || id.includes("property-revenue")
      )
    ).toBe(true);
  });

  it("impact from fixed-costs reaches dashboard", () => {
    const graph = loadDependencyGraph();
    const { impacts } = computeImpact(graph, "data/finance/fixed-costs.yaml");
    const targetIds = impacts.map((i) => i.nodeId);
    expect(targetIds).toContain("report-dashboard");
    expect(targetIds).toContain("data/plans/yojitsu-fy2026.yaml");
  });

  it("findStaleDependencies returns array (may be empty)", () => {
    const graph = loadDependencyGraph();
    const stale = findStaleDependencies(graph);
    expect(Array.isArray(stale)).toBe(true);
    for (const item of stale) {
      expect(item.sourceMtime.getTime()).toBeGreaterThan(item.targetMtime.getTime());
    }
  });
});
