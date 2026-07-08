import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureOrgOsStateDir,
  WIRE_CONSOLE_DEFAULT_PORT,
  WIRE_CONSOLE_MANIFEST_PATH,
} from "./paths.js";
import { anyWireConsoleTenantEnabled } from "./tenant-registry.js";

export interface WireConsoleManifest {
  url: string;
  port: number;
  pid: number;
  started_at: string;
}

export function readWireConsoleManifest(): WireConsoleManifest | undefined {
  if (!existsSync(WIRE_CONSOLE_MANIFEST_PATH)) return undefined;
  try {
    return JSON.parse(readFileSync(WIRE_CONSOLE_MANIFEST_PATH, "utf-8")) as WireConsoleManifest;
  } catch {
    return undefined;
  }
}

export function writeWireConsoleManifest(manifest: WireConsoleManifest): void {
  ensureOrgOsStateDir();
  writeFileSync(WIRE_CONSOLE_MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

export function removeWireConsoleManifest(): void {
  if (existsSync(WIRE_CONSOLE_MANIFEST_PATH)) unlinkSync(WIRE_CONSOLE_MANIFEST_PATH);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getWireConsoleStatus(): {
  running: boolean;
  manifest?: WireConsoleManifest;
} {
  const manifest = readWireConsoleManifest();
  if (!manifest) return { running: false };
  if (!isProcessAlive(manifest.pid)) {
    removeWireConsoleManifest();
    return { running: false };
  }
  return { running: true, manifest };
}

const RUNNER = join(fileURLToPath(new URL(".", import.meta.url)), "run-standalone.ts");

export async function spawnWireConsoleServer(opts?: {
  port?: number;
  host?: string;
}): Promise<WireConsoleManifest> {
  const existing = getWireConsoleStatus();
  if (existing.running && existing.manifest) {
    return existing.manifest;
  }

  const port = opts?.port ?? WIRE_CONSOLE_DEFAULT_PORT;
  const host = opts?.host ?? "127.0.0.1";
  const child = spawn(
    process.execPath,
    ["--import", "tsx", RUNNER, "--host", host, "--port", String(port)],
    {
      detached: true,
      stdio: "ignore",
      env: process.env,
    }
  );
  child.unref();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const status = getWireConsoleStatus();
    if (status.running && status.manifest) return status.manifest;
    await sleep(100);
  }

  throw new Error("Wire Console failed to start — check port availability");
}

export function stopWireConsoleServer(): boolean {
  const status = getWireConsoleStatus();
  if (!status.running || !status.manifest) {
    removeWireConsoleManifest();
    return false;
  }
  try {
    process.kill(status.manifest.pid, "SIGTERM");
  } catch {
    /* already dead */
  }
  removeWireConsoleManifest();
  return true;
}

export async function tryStartWireConsoleAfterInit(): Promise<WireConsoleManifest | undefined> {
  if (!anyWireConsoleTenantEnabled()) return undefined;
  try {
    return await spawnWireConsoleServer();
  } catch (err) {
    console.warn(
      `Wire Console auto-start skipped: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}
