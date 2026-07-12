import { describe, expect, it } from "vitest";
import {
  buildCliCommandCatalog,
  validateCliCommandCatalog,
} from "../src/lib/cli-command-catalog.js";
import { buildOrgOsCommandProgram } from "../src/lib/cli-program.js";

describe("CLI command catalog contract", () => {
  it("validates canonical wire facade and legacy roots", () => {
    const entries = buildCliCommandCatalog(buildOrgOsCommandProgram());
    expect(validateCliCommandCatalog(entries)).toEqual([]);
    expect(entries.some((entry) => entry.path[0] === "wire" && entry.canonical)).toBe(true);
    expect(entries.some((entry) => entry.path[0] === "protocol" && entry.deprecated)).toBe(true);
    expect(entries.some((entry) => entry.path[0] === "wire-gateway" && entry.deprecated)).toBe(true);
  });
});
