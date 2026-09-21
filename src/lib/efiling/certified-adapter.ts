import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { filingError } from "./errors.js";

/** Certified adapter marker. Env vars cannot set this. */
export const certifiedAdapter = Symbol.for("orgos.efiling.certifiedAdapter");

const BLOCKED_ENV_KEYS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
]);

const SECRET_ENV_PATTERN =
  /(pin|password|passwd|passphrase|secret|private[_-]?key|client[_-]?secret|credential|user_id|nozeisha)/i;

export type CertifiedCommand = {
  executable: string;
  executableSha256: string;
  evidencePath: string;
  evidenceSha256: string;
};

export function assertCertifiedAdapter(
  adapter: object,
  opts?: { allowUncertifiedTestDouble?: boolean }
): void {
  if (opts?.allowUncertifiedTestDouble) return;
  const marked = (adapter as Record<symbol, unknown>)[certifiedAdapter];
  if (marked !== true) {
    throw filingError(
      "EFILING_UNCERTIFIED_ADAPTER",
      "adapter is not a hash-certified filing adapter",
      "SPEC_BLOCKED"
    );
  }
}

export function markCertifiedAdapter<T extends object>(adapter: T): T {
  Object.defineProperty(adapter, certifiedAdapter, { value: true });
  return adapter;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function assertCertifiedCommand(command: CertifiedCommand): void {
  if (!isAbsolute(command.executable) || !isAbsolute(command.evidencePath)) {
    throw filingError("EFILING_COMMAND_PATH", "certified command paths must be absolute");
  }
  if (!existsSync(command.executable) || !existsSync(command.evidencePath)) {
    throw filingError(
      "EFILING_COMMAND_MISSING",
      "certified command executable or evidence is missing"
    );
  }
  if (sha256File(command.executable) !== command.executableSha256) {
    throw filingError(
      "EFILING_COMMAND_HASH",
      "certified executable SHA-256 does not match the pin"
    );
  }
  if (sha256File(command.evidencePath) !== command.evidenceSha256) {
    throw filingError(
      "EFILING_COMMAND_EVIDENCE_HASH",
      "certification evidence SHA-256 does not match the pin"
    );
  }
}

export function buildFilingChildEnv(
  parent: NodeJS.ProcessEnv,
  extra: Record<string, string>
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  if (parent.PATH) env.PATH = parent.PATH;
  for (const [key, value] of Object.entries(extra)) {
    if (SECRET_ENV_PATTERN.test(key)) {
      throw filingError("EFILING_SECRET_ENV", `refusing secret child environment name ${key}`);
    }
    if (BLOCKED_ENV_KEYS.has(key)) continue;
    env[key] = value;
  }
  for (const key of BLOCKED_ENV_KEYS) delete env[key];
  return env;
}

/** Spawn a pinned executable without a shell. */
export function runCertifiedCommand(
  command: CertifiedCommand,
  args: string[],
  env: NodeJS.ProcessEnv
): { status: number | null; stdout: string; stderr: string } {
  assertCertifiedCommand(command);
  const result = spawnSync(command.executable, args, {
    env,
    shell: false,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
