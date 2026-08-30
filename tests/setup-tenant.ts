import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

/** Default tenant for tests (mal instance). */
process.env.ORGOS_TENANT ??= "mal";
process.env.STEWARD_TENANT ??= process.env.ORGOS_TENANT;
/** Tests use minimal protocol fixtures — skip full pre-deliver validate (production enforces). */
process.env.STEWARD_SKIP_DELIVER_VALIDATE ??= "1";

/**
 * Operational audit logs belong to tenant activity, not OrgOS dev/test runs.
 * Redirect appendAuditEvent away from tenant docs/reports during vitest.
 */
process.env.ORGOS_AUDIT_LOG ??= join(tmpdir(), `orgos-vitest-audit-${process.pid}.jsonl`);
process.env.ORGOS_AUDIT_TENANT ??= "_orgos_test";
process.env.ORGOS_AUDIT_BRIDGE_DISABLED ??= "1";
process.env.ORGOS_HUMAN_APPROVAL_STORE ??= join(tmpdir(), `orgos-vitest-hac-${process.pid}.json`);
/** Stripe keys saved by a test must not persist into the workspace store. */
process.env.ORGOS_STRIPE_SECRETS_FILE ??= join(
  tmpdir(),
  `orgos-vitest-stripe-${process.pid}.env`,
);

/** Remove polluted audit logs left by older test runs (gitignored runtime files). */
const TENANTS_WITH_STALE_AUDIT_LOGS = ["mal", "demo", "acme", "aiac", "southwood"] as const;
for (const tenantId of TENANTS_WITH_STALE_AUDIT_LOGS) {
  const stale = join(ROOT_DIR, "tenants", tenantId, "docs/reports/audit-log/audit.jsonl");
  if (existsSync(stale)) {
    unlinkSync(stale);
  }
}
