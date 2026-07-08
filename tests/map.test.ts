import { describe, it, expect } from "vitest";
import { buildTenantMapTree, formatMapTree } from "../src/lib/tenant-map.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("map tree", () => {
  it("builds tenant tree with modules and graph nodes", () => {
    setTenantId("demo");
    const tree = buildTenantMapTree();
    const text = formatMapTree(tree);
    expect(text).toContain("tenants/demo/");
    expect(text).toContain("data/company.yaml");
    expect(text).toContain("modules.yaml");
  });
});
