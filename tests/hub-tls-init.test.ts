import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHubTlsInit } from "../src/commands/hub.js";

describe("hub tls-init", () => {
  const logs: string[] = [];
  let dir = "";

  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes CA and server certs to a temp dir (not git)", () => {
    dir = mkdtempSync(join(tmpdir(), "hub-tls-init-"));
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      runHubTlsInit({ outputDir: dir, force: true, json: true });
    } finally {
      console.log = originalLog;
    }
    expect(existsSync(join(dir, "ca.pem"))).toBe(true);
    expect(existsSync(join(dir, "server.pem"))).toBe(true);
    expect(existsSync(join(dir, "server.key"))).toBe(true);
    expect(logs.join("\n")).toContain(dir);
  });
});
