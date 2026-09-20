import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { withYamlFileLock, YamlFileBusyError } from "../src/lib/yaml-atomic.js";

describe("YAML operation lock recovery", () => {
  it("recovers a lock owned by a dead process", () => {
    const root = mkdtempSync(join(tmpdir(), "yaml-lock-"));
    const target = join(root, "annual-close.operation");
    mkdirSync(root, { recursive: true });
    writeFileSync(`${target}.lock`, JSON.stringify({ pid: 2_147_483_647, token: "dead-owner", created_at: "2020-01-01T00:00:00.000Z" }));
    expect(withYamlFileLock(target, () => "recovered", { retries: 1, retryDelayMs: 0 })).toBe("recovered");
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it("does not steal a lock held by the current live process", () => {
    const root = mkdtempSync(join(tmpdir(), "yaml-lock-live-"));
    const target = join(root, "annual-close.operation");
    writeFileSync(`${target}.lock`, JSON.stringify({ pid: process.pid, token: "live-owner", created_at: new Date().toISOString() }));
    expect(() => withYamlFileLock(target, () => undefined, { retries: 0 })).toThrow(YamlFileBusyError);
  });

  it("recovers a recovery lock owned by a dead process", () => {
    const root = mkdtempSync(join(tmpdir(), "yaml-recovery-lock-"));
    const target = join(root, "annual-close.operation");
    writeFileSync(`${target}.recovery.lock`, JSON.stringify({ pid: 2_147_483_647, token: "dead-recovery-owner", created_at: "2020-01-01T00:00:00.000Z" }));
    expect(withYamlFileLock(target, () => "recovered", { retries: 2, retryDelayMs: 0 })).toBe("recovered");
    expect(existsSync(`${target}.recovery.lock`)).toBe(false);
  });

  it("recovers an expired malformed lock but not a fresh one", () => {
    const root = mkdtempSync(join(tmpdir(), "yaml-malformed-lock-"));
    const target = join(root, "annual-close.operation");
    writeFileSync(`${target}.lock`, "");
    expect(() => withYamlFileLock(target, () => undefined, { retries: 0, staleLockMs: 60_000 })).toThrow(YamlFileBusyError);
    expect(withYamlFileLock(target, () => "recovered", { retries: 1, retryDelayMs: 0, staleLockMs: 0 })).toBe("recovered");
  });

  it("serializes two processes racing to recover the same dead owner", async () => {
    const root = mkdtempSync(join(tmpdir(), "yaml-lock-race-"));
    const target = join(root, "annual-close.operation");
    const events = join(root, "events.log");
    writeFileSync(`${target}.lock`, JSON.stringify({ pid: 2_147_483_647, token: "dead-race-owner", created_at: "2020-01-01T00:00:00.000Z" }));
    const moduleUrl = new URL("../src/lib/yaml-atomic.ts", import.meta.url).href;
    const childCode = [
      `import { appendFileSync } from "node:fs";`,
      `import { withYamlFileLock } from ${JSON.stringify(moduleUrl)};`,
      `const [target, events, id] = process.argv.slice(1);`,
      `withYamlFileLock(target, () => {`,
      `  appendFileSync(events, id + ":start\\n");`,
      `  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 75);`,
      `  appendFileSync(events, id + ":end\\n");`,
      `}, { retries: 200, retryDelayMs: 5 });`,
    ].join("\n");
    const run = (id: string) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", childCode, target, events, id], { stdio: "pipe" });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${id} exited ${code}: ${stderr}`)));
    });
    await Promise.all([run("A"), run("B")]);
    const rows = readFileSync(events, "utf-8").trim().split("\n");
    expect(rows).toSatisfy((value: string[]) =>
      JSON.stringify(value) === JSON.stringify(["A:start", "A:end", "B:start", "B:end"]) ||
      JSON.stringify(value) === JSON.stringify(["B:start", "B:end", "A:start", "A:end"]),
    );
  }, 15_000);
});
