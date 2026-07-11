import { describe, expect, it } from "vitest";
import { agentCatalogSchema } from "../schemas/index.js";
import {
  AGENT_ID_ALIASES,
  AGENT_IDS,
} from "../schemas/generated/agent-ids.js";
import {
  AGENT_CATALOG_PATH,
  loadAgentCatalog,
  validateAgentCatalog,
} from "../src/lib/agent-catalog.js";
import { validateAgentCatalogIntegrity } from "../src/lib/integrity.js";

describe("agent catalog contract", () => {
  it("exports and parses the canonical v3 catalog schema", () => {
    const catalog = loadAgentCatalog();
    expect(catalog.version).toBeGreaterThanOrEqual(3);
    expect(agentCatalogSchema.parse(catalog)).toEqual(catalog);
  });

  it("keeps generated accepted IDs and aliases synchronized", () => {
    const catalog = loadAgentCatalog();
    const expectedIds = [
      ...Object.values(catalog.agents).map((agent) => agent.id),
      ...Object.keys(catalog.aliases),
    ];

    expect([...AGENT_IDS]).toEqual(expectedIds);
    expect(AGENT_ID_ALIASES).toEqual(catalog.aliases);
    expect(validateAgentCatalog()).toEqual([]);
  });

  it("connects catalog failures to the validate integrity gate", () => {
    const catalogIssues = validateAgentCatalogIntegrity().filter(
      (issue) => issue.file === AGENT_CATALOG_PATH
    );
    expect(catalogIssues).toEqual([]);
  });
});
