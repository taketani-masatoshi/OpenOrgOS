import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

describe("acme tenant validate", () => {
  it("passes steward validate (exit 0)", () => {
    execFileSync("npm", ["run", "steward", "--", "--tenant", "acme", "validate"], {
      cwd: root,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, STEWARD_TENANT: "acme" },
    });
  });

  it("does not reference MAL-specific property paths", () => {
    const out = execFileSync("npm", ["run", "steward", "--", "--tenant", "acme", "status"], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, STEWARD_TENANT: "acme" },
    });
    const forbidden = ["bancho", "kamezawa", "PROP-002-kamezawa", "mal/docs"];
    for (const f of forbidden) {
      expect(out.toLowerCase()).not.toContain(f.toLowerCase());
    }
  });
});
