import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

describe("validate-protocol-tenants list", () => {
  it("ci-validate-tenants.yaml lists all jurisdiction demos plus inter-org pair", () => {
    const path = join(process.cwd(), "steward/platform/protocol/ci-validate-tenants.yaml");
    const doc = YAML.parse(readFileSync(path, "utf-8")) as { tenants: string[] };
    expect(doc.tenants).toContain("demo");
    expect(doc.tenants).toContain("mal");
    expect(doc.tenants).toContain("southwood");
    expect(doc.tenants.length).toBeGreaterThanOrEqual(15);
  });
});
