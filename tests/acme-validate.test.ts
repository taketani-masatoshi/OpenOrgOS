import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

describe("acme tenant validate", () => {
  it(
    "passes orgos validate (exit 0)",
    () => {
      execFileSync("npm", ["run", "orgos", "--", "--tenant", "acme", "validate"], {
        cwd: root,
        encoding: "utf-8",
        stdio: "pipe",
        env: { ...process.env, ORGOS_TENANT: "acme" },
      });
    },
    15_000
  );

  it("does not reference MAL-specific property paths", () => {
    const out = execFileSync("npm", ["run", "orgos", "--", "--tenant", "acme", "status"], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, ORGOS_TENANT: "acme" },
    });
    const forbidden = ["bancho", "kamezawa", "PROP-002-kamezawa", "mal/docs"];
    for (const f of forbidden) {
      expect(out.toLowerCase()).not.toContain(f.toLowerCase());
    }
  }, 30_000);
});
