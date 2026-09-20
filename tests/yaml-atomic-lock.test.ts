import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withYamlFileLock, YamlFileBusyError } from "../src/lib/yaml-atomic.js";

describe("YAML operation lock recovery", () => {
  it("recovers a lock owned by a dead process", () => {
    const root = mkdtempSync(join(tmpdir(), "yaml-lock-"));
    const target = join(root, "annual-close.operation");
    mkdirSync(root, { recursive: true });
    writeFileSync(`${target}.lock`, JSON.stringify({ pid: 2_147_483_647, created_at: "2020-01-01T00:00:00.000Z" }));
    expect(withYamlFileLock(target, () => "recovered", { retries: 1, retryDelayMs: 0 })).toBe("recovered");
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it("does not steal a lock held by the current live process", () => {
    const root = mkdtempSync(join(tmpdir(), "yaml-lock-live-"));
    const target = join(root, "annual-close.operation");
    writeFileSync(`${target}.lock`, JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
    expect(() => withYamlFileLock(target, () => undefined, { retries: 0 })).toThrow(YamlFileBusyError);
  });
});
