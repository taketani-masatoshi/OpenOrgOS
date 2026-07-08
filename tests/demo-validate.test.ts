import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { validateRegulations } from "../src/lib/regulations.js";

describe("demo tenant validate", () => {
  it("passes steward validate (exit 0)", () => {
    const root = join(import.meta.dirname, "..");
    execFileSync(
      "npm",
      ["run", "orgos", "--", "--tenant", "demo", "validate"],
      { cwd: root, encoding: "utf-8", stdio: "pipe" }
    );
  });
});

describe("demo regulations bind consistency", () => {
  it("has no ineffective enabled regulations", () => {
    setTenantId("demo");
    const issues = validateRegulations();
    const ineffective = issues.filter((i) => i.message.includes("ineffective"));
    expect(ineffective).toEqual([]);
  });
});
