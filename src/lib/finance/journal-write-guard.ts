import { getTenantId } from "../tenant.js";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";

const VITEST_JOURNAL_GUARD =
  process.env.VITEST === "true" ||
  process.env.VITEST_WORKER_ID !== undefined ||
  process.env.NODE_ENV === "test";

/** Tenants that may receive journal-entries.yaml writes during vitest. */
const VITEST_JOURNAL_WRITE_TENANTS = new Set(["_fixture-books"]);

/**
 * Block vitest from mutating production tenant ledgers (e.g. mal).
 * Finance tests must use {@link FINANCE_FIXTURE_TENANT} or an isolated ORGOS_WORKSPACE.
 */
export function assertJournalWriteAllowed(): void {
  if (!VITEST_JOURNAL_GUARD) return;
  const tenant = getTenantId();
  if (VITEST_JOURNAL_WRITE_TENANTS.has(tenant)) return;
  // Isolated temp workspaces (product/accounting tests) are safe to mutate.
  try {
    const workspace = getWorkspaceRoot();
    const install = getInstallRoot();
    if (workspace !== install) return;
  } catch {
    /* fall through */
  }
  throw new Error(
    `Vitest journal writes are restricted to fixture tenants (${[...VITEST_JOURNAL_WRITE_TENANTS].join(", ")}) or ORGOS_WORKSPACE≠install; current tenant=${tenant}`,
  );
}
