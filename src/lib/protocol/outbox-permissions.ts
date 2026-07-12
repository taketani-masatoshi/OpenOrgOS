import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getProtocolDataDir, getProtocolInboxDir, getProtocolOutboxDir } from "./paths.js";

export interface ProtocolOutboxPermissionSpec {
  outboxDirMode: number;
  inboxDirMode: number;
  protocolDataDirMode: number;
  fileMode: number;
}

export const DEFAULT_PROTOCOL_OUTBOX_PERMISSIONS: ProtocolOutboxPermissionSpec = {
  outboxDirMode: 0o750,
  inboxDirMode: 0o750,
  protocolDataDirMode: 0o700,
  fileMode: 0o640,
};

export interface ApplyProtocolOutboxPermissionsOptions {
  user?: string;
  group?: string;
  dryRun?: boolean;
  spec?: ProtocolOutboxPermissionSpec;
}

export interface ApplyProtocolOutboxPermissionsResult {
  applied: string[];
  skippedChown: boolean;
}

function canChown(): boolean {
  if (process.platform === "win32") return false;
  try {
    return typeof process.getuid === "function" && process.getuid() === 0;
  } catch {
    return false;
  }
}

function setDirMode(path: string, mode: number, dryRun: boolean): void {
  mkdirSync(path, { recursive: true });
  if (dryRun) return;
  chmodSync(path, mode);
}

function setFileModes(dir: string, mode: number, dryRun: boolean, applied: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    applied.push(path);
    if (!dryRun) chmodSync(path, mode);
  }
}

function setOwnership(
  paths: string[],
  user: string | undefined,
  group: string | undefined,
  dryRun: boolean
): boolean {
  if (!user || !canChown()) return false;
  for (const path of paths) {
    if (!existsSync(path)) continue;
    if (dryRun) continue;
    const owner = group ? `${user}:${group}` : user;
    execFileSync("chown", [owner, path], { stdio: "ignore" });
  }
  return true;
}

export function applyProtocolOutboxPermissions(
  options: ApplyProtocolOutboxPermissionsOptions = {}
): ApplyProtocolOutboxPermissionsResult {
  const spec = options.spec ?? DEFAULT_PROTOCOL_OUTBOX_PERMISSIONS;
  const outbox = getProtocolOutboxDir();
  const inbox = getProtocolInboxDir();
  const protocolData = getProtocolDataDir();
  const applied: string[] = [outbox, inbox, protocolData];

  setDirMode(outbox, spec.outboxDirMode, options.dryRun === true);
  setDirMode(inbox, spec.inboxDirMode, options.dryRun === true);
  setDirMode(protocolData, spec.protocolDataDirMode, options.dryRun === true);

  setFileModes(outbox, spec.fileMode, options.dryRun === true, applied);
  setFileModes(inbox, spec.fileMode, options.dryRun === true, applied);

  const chowned = setOwnership(
    [outbox, inbox, protocolData],
    options.user,
    options.group,
    options.dryRun === true
  );

  return { applied, skippedChown: !chowned };
}

export interface OutboxPermissionCheckIssue {
  code: string;
  message: string;
  path: string;
}

/** Warn when outbox/inbox are world-writable (production misconfiguration). */
export function checkProtocolOutboxPermissionsLoose(): OutboxPermissionCheckIssue[] {
  if (process.platform === "win32") return [];

  const issues: OutboxPermissionCheckIssue[] = [];
  const enforce = process.env.STEWARD_ENFORCE_OUTBOX_PERMISSIONS === "1";

  for (const [label, dir] of [
    ["outbox", getProtocolOutboxDir()],
    ["inbox", getProtocolInboxDir()],
  ] as const) {
    if (!existsSync(dir)) continue;
    const mode = statSync(dir).mode & 0o777;
    if (mode & 0o002) {
      issues.push({
        code: "outbox-world-writable",
        message: `Protocol ${label} directory is world-writable — direct envelope writes possible`,
        path: dir,
      });
    } else if (enforce && mode !== 0o750 && mode !== 0o700) {
      issues.push({
        code: "outbox-permissions-loose",
        message: `Protocol ${label} directory mode ${mode.toString(8)} (expected 750 in production)`,
        path: dir,
      });
    }
  }
  return issues;
}
