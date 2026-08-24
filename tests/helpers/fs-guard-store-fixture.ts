import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureIssuer,
  setFsGuardPathsForTests,
  type FsGuardPaths,
} from "../../src/lib/org/fs-guard/index.js";

export interface FsGuardStoreFixture {
  paths: FsGuardPaths;
  cleanup: () => void;
}

/** Temp-dir FS-guard paths — uninitialized until ensureIssuer runs. */
export function makeFsGuardPathsForTests(prefix = "orgos-fs-guard-"): FsGuardPaths {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    identitiesPath: join(root, "agent-identities.yaml"),
    eventsPath: join(root, "fs-guard-events.jsonl"),
    snapshotPath: join(root, "fs-guard-grants.yaml"),
    appliesPath: join(root, "fs-guard-applies.jsonl"),
    leasesPath: join(root, "canonical-leases.json"),
    issuerKeyPath: join(root, "issuer.pem"),
    agentKeyDir: join(root, "agents"),
  };
}

export function removeFsGuardPathsForTests(paths: FsGuardPaths): void {
  rmSync(join(paths.issuerKeyPath, ".."), { recursive: true, force: true });
}

/**
 * Register an initialized FS-guard store so production checks
 * (`fs_guard_initialized`) pass without touching the tenant workspace.
 * Call before switching env to production.
 */
export function installFsGuardStoreForTests(
  prefix = "orgos-prod-fs-guard-"
): FsGuardStoreFixture {
  const paths = makeFsGuardPathsForTests(prefix);
  setFsGuardPathsForTests(paths);
  ensureIssuer(paths);
  return {
    paths,
    cleanup: () => {
      setFsGuardPathsForTests(undefined);
      removeFsGuardPathsForTests(paths);
    },
  };
}
