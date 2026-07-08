import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("package release readiness", () => {
  it("has publish-check and version-sync scripts", () => {
    expect(existsSync(join(ROOT, "scripts/package-publish-check.mjs"))).toBe(true);
    expect(existsSync(join(ROOT, "scripts/sync-package-versions.mjs"))).toBe(true);
  });

  it("syncs workspace package versions from root", () => {
    const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { version: string };
    const cli = JSON.parse(
      readFileSync(join(ROOT, "packages/orgos-cli/package.json"), "utf-8")
    ) as { version: string };
    const wire = JSON.parse(
      readFileSync(join(ROOT, "packages/orgos-wire/package.json"), "utf-8")
    ) as { version: string; peerDependencies?: Record<string, string> };
    expect(cli.version).toBe(root.version);
    expect(wire.version).toBe(root.version);
    expect(wire.peerDependencies?.["@orgos/cli"]).toBe(root.version);
  });

  it("documents release process", () => {
    const release = readFileSync(join(ROOT, "RELEASE.md"), "utf-8");
    expect(release).toContain("package:publish-check");
    expect(release).toContain("steward-chat:release-check");
  });

  it("has homebrew formula templates", () => {
    expect(existsSync(join(ROOT, "homebrew-tap/Formula/orgos.rb"))).toBe(true);
    expect(existsSync(join(ROOT, "homebrew-tap/Formula/orgos-wire.rb"))).toBe(true);
  });

  it("has CHANGELOG", () => {
    expect(existsSync(join(ROOT, "CHANGELOG.md"))).toBe(true);
  });

  it("has homebrew sha256 update script", () => {
    expect(existsSync(join(ROOT, "scripts/update-homebrew-sha256.mjs"))).toBe(true);
  });

  it("release workflow gates publish with release-check", () => {
    const workflow = readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(workflow).toContain("steward-chat:release-check");
    expect(workflow).toMatch(/publish-npm:[\s\S]*needs:[\s\S]*release-check/);
  });

  it("optional npm registry version after publish", async () => {
    if (process.env.NPM_PUBLISH_VERIFY !== "1") return;
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("npm", ["view", "@orgos/cli", "version"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
