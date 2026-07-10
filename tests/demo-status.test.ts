import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

describe("demo tenant status", () => {
  it(
    "does not reference MAL-specific paths",
    () => {
      const root = join(import.meta.dirname, "..");
      const out = execFileSync(
        "npm",
        ["run", "orgos", "--", "--tenant", "demo", "status"],
        { cwd: root, encoding: "utf-8", env: { ...process.env, ORGOS_TENANT: "demo" } }
      );
      const forbidden = ["kamezawa", "PROP-002-kamezawa", "bancho", "CTR-012", "CTR-013", "CTR-014"];
      for (const token of forbidden) {
        expect(out.toLowerCase()).not.toContain(token.toLowerCase());
      }
    },
    30_000
  );
});
