import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listRosterManagedTenants } from "../src/lib/tenant-roster-bootstrap.js";

const FIXTURE_ROOT = join(process.cwd(), "tests", "fixtures", "tenant-rosters");

describe("tenant roster fixtures", () => {
  it("every tenant has a committed roster fixture", () => {
    const expected = listRosterManagedTenants();
    const fixtures = readdirSync(FIXTURE_ROOT)
      .filter((name) => existsSync(join(FIXTURE_ROOT, name, "agents.yaml")))
      .sort();
    expect(fixtures).toEqual(expected);
  });
});
