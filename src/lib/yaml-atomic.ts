import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";

export class YamlFileBusyError extends Error {
  readonly code = "yaml_file_busy" as const;

  constructor(path: string) {
    super(`YAML file is busy: ${path}`);
    this.name = "YamlFileBusyError";
  }
}

/**
 * Write YAML via temp file + rename so readers never see a torn file.
 * (rename is atomic on the same filesystem.)
 */
export function writeYamlFileAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, YAML.stringify(data), {
      encoding: "utf-8",
      mode: 0o600,
    });
    renameSync(temp, path);
  } catch (error) {
    try {
      if (existsSync(temp)) unlinkSync(temp);
    } catch {
      // best-effort cleanup
    }
    throw error;
  }
}

function sleepMs(ms: number): void {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    // sync backoff for exclusive YAML locks (callers are sync)
  }
}

/**
 * Exclusive lock around a YAML critical section (assert → mutate → save).
 * Uses O_EXCL lockfile; retries briefly so concurrent UI/API calls serialize.
 */
export function withYamlFileLock<T>(
  path: string,
  fn: () => T,
  options?: { retries?: number; retryDelayMs?: number },
): T {
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const retries = options?.retries ?? 40;
  const retryDelayMs = options?.retryDelayMs ?? 25;
  let fd: number | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fd = openSync(lockPath, "wx", 0o600);
      break;
    } catch {
      if (attempt === retries) throw new YamlFileBusyError(path);
      sleepMs(retryDelayMs);
    }
  }
  if (fd == null) throw new YamlFileBusyError(path);
  try {
    return fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
      // ignore
    }
    try {
      unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
}
