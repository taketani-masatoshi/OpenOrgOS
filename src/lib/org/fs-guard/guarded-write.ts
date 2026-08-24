import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveTenantPath } from "../../tenant.js";
import { applyAgentWrite } from "./policy.js";
import { FsGuardError } from "./errors.js";
import { isFsGuardEnforced } from "./store.js";

/** Write tenant-relative content; uses FS-guard when enforced. CAS hash is caller-supplied. */
export function writeTenantContentGuarded(opts: {
  agentId: string;
  logicalPath: string;
  content: string;
  runId?: string;
  expectedSha256?: string;
}): string {
  const logical = opts.logicalPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (isFsGuardEnforced()) {
    if (!opts.expectedSha256 || !/^[a-f0-9]{64}$/.test(opts.expectedSha256)) {
      throw new FsGuardError(
        "cas_required",
        `CAS expected_sha256 is required for ${logical} (new file: sha256 of empty string)`
      );
    }
    const result = applyAgentWrite({
      agentId: opts.agentId,
      path: logical,
      content: opts.content,
      runId: opts.runId,
      expectedSha256: opts.expectedSha256,
    });
    return result.path;
  }
  const abs = resolveTenantPath(logical);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, opts.content, "utf-8");
  return logical;
}
