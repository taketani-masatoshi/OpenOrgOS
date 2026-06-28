import { createHash } from "node:crypto";
import { listWireConsoleTenants } from "./tenant-registry.js";
import { getTenantSnapshot } from "./tenant-data.js";

export function computeWireConsoleFingerprints(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tenant of listWireConsoleTenants()) {
    const snap = getTenantSnapshot(tenant.id);
    const payload = JSON.stringify({
      counts: snap.counts,
      validation_ok: snap.validation.ok,
      issue_count: snap.validation.issues.length,
      warning_count: snap.validation.warnings.length,
    });
    out[tenant.id] = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }
  return out;
}

export function globalWireConsoleFingerprint(fingerprints: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(fingerprints)).digest("hex").slice(0, 16);
}
