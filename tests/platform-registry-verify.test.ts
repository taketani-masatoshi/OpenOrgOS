import { describe, it, expect } from "vitest";
import { verifyPlatformRegistry } from "../src/lib/platform-registry-verify.js";
import { runPlatformExtensionChecks } from "../src/lib/platform-extension-check.js";

describe("platform registry verify", () => {
  it("catalog routing skills capability are consistent", () => {
    const issues = verifyPlatformRegistry();
    if (issues.length) {
      console.log(issues.map((i) => `[${i.source}] ${i.message}`).join("\n"));
    }
    expect(issues).toEqual([]);
  });

  it("extension check passes required docs and advisor profile", () => {
    const checks = runPlatformExtensionChecks();
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) {
      console.log(failed.map((c) => `${c.id}: ${c.detail}`).join("\n"));
    }
    expect(failed.length).toBe(0);
  });
});
