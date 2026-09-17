import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const root = join(import.meta.dirname, "..");

describe("acme tenant validate", () => {
  it("passes orgos validate (exit 0)", async () => {
    await execFileAsync("npm", ["run", "orgos", "--", "--tenant", "acme", "validate"], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, ORGOS_TENANT: "acme" },
    });
  }, 60_000);

  it("does not reference MAL-specific property paths", async () => {
    const { stdout: out } = await execFileAsync(
      "npm",
      ["run", "orgos", "--", "--tenant", "acme", "status"],
      {
        cwd: root,
        encoding: "utf-8",
        env: { ...process.env, ORGOS_TENANT: "acme" },
      },
    );
    const forbidden = ["bancho", "kamezawa", "PROP-002-kamezawa", "mal/docs"];
    for (const f of forbidden) {
      expect(out.toLowerCase()).not.toContain(f.toLowerCase());
    }
  }, 60_000);
});
