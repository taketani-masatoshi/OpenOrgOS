import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";
import {
  fsGuardEventSchema,
  fsGuardGrantsFileSchema,
  fsGuardIdentitiesFileSchema,
  type FsGuardEvent,
  type FsGuardGrantsFile,
  type FsGuardIdentitiesFile,
} from "../../../../schemas/org/fs-guard.js";
import { getTenantId, tenantDataPath } from "../../tenant.js";
import { appendJsonl, loadJsonl } from "../../jsonl-store.js";
import { writeYamlFileAtomic } from "../../yaml-atomic.js";

export interface FsGuardPaths {
  identitiesPath: string;
  eventsPath: string;
  snapshotPath: string;
  issuerKeyPath: string;
  agentKeyDir: string;
}

let override: FsGuardPaths | undefined;

export function setFsGuardPathsForTests(paths?: FsGuardPaths): void {
  override = paths;
}

export function defaultFsGuardPaths(): FsGuardPaths {
  const tenantId = getTenantId();
  return {
    identitiesPath: tenantDataPath("org", "agent-identities.yaml"),
    eventsPath: tenantDataPath("org", "fs-guard-events.jsonl"),
    snapshotPath: tenantDataPath("org", "fs-guard-grants.yaml"),
    issuerKeyPath: tenantDataPath(".orgos", "fs-guard-issuer.pem"),
    agentKeyDir: join(homedir(), ".orgos", "agents", tenantId),
  };
}

export function fsGuardPaths(): FsGuardPaths {
  return override ?? defaultFsGuardPaths();
}

export function isFsGuardInitialized(paths = fsGuardPaths()): boolean {
  return existsSync(paths.identitiesPath) && existsSync(paths.issuerKeyPath);
}

export function isFsGuardEnforced(paths = fsGuardPaths()): boolean {
  if (process.env.ORGOS_FS_GUARD === "off") return false;
  if (process.env.ORGOS_FS_GUARD === "enforce") return true;
  return isFsGuardInitialized(paths);
}

export function loadIdentities(paths = fsGuardPaths()): FsGuardIdentitiesFile | undefined {
  if (!existsSync(paths.identitiesPath)) return undefined;
  return fsGuardIdentitiesFileSchema.parse(YAML.parse(readFileSync(paths.identitiesPath, "utf-8")));
}

export function saveIdentities(file: FsGuardIdentitiesFile, paths = fsGuardPaths()): void {
  mkdirSync(dirname(paths.identitiesPath), { recursive: true });
  writeYamlFileAtomic(paths.identitiesPath, fsGuardIdentitiesFileSchema.parse(file));
}

export function loadGrantEvents(paths = fsGuardPaths()): FsGuardEvent[] {
  return loadJsonl(paths.eventsPath, (raw) => fsGuardEventSchema.parse(raw));
}

export function appendGrantEvent(event: FsGuardEvent, paths = fsGuardPaths()): void {
  appendJsonl(paths.eventsPath, fsGuardEventSchema.parse(event));
}

export function saveGrantSnapshot(file: FsGuardGrantsFile, paths = fsGuardPaths()): void {
  mkdirSync(dirname(paths.snapshotPath), { recursive: true });
  writeYamlFileAtomic(paths.snapshotPath, fsGuardGrantsFileSchema.parse(file));
}

export function writePrivateKeyPem(path: string, pem: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pem, { encoding: "utf-8", mode: 0o600 });
}

export function readPrivateKeyPem(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8");
}

export function issuerKeyPath(paths = fsGuardPaths()): string {
  return paths.issuerKeyPath;
}

export function agentPrivateKeyPath(agentId: string, paths = fsGuardPaths()): string {
  return join(paths.agentKeyDir, `${agentId}.pem`);
}
