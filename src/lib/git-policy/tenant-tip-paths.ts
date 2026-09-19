/**
 * Path rules for Core tip hygiene (docs/org-os/tenant-github-tip-policy.md).
 * Used by unit tests with synthetic paths; the shell script enforces the live tip.
 */

const ALLOWED_PREFIXES = ["tenants/_template/", "tenants/_fixture-books/"] as const;

const ALLOWED_DEMO =
  /^tenants\/(demo|[a-z]{2}-demo|demo-signup-[0-9]+|acme|pilot-ledger-[0-9a-z-]+|aiac|southwood|mal|sample-co|wire-console-test)\//;

function isAllowedTenantPath(path: string): boolean {
  if (ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return true;
  if (path.includes(".example")) return true;
  if (path.includes("00-README") || path.includes("00-このフォルダについて")) return true;
  return false;
}

function isAllowedDemoTenant(path: string): boolean {
  return ALLOWED_DEMO.test(path);
}

export type TipViolationKind = "key_material" | "chat_runtime" | "finance_ledger";

export type TipViolation = { kind: TipViolationKind; path: string };

/** Classify tracked tip paths (synthetic or real) against tip policy. */
export function findTenantTipViolations(trackedPaths: string[]): TipViolation[] {
  const out: TipViolation[] = [];
  for (const path of trackedPaths) {
    if (isAllowedTenantPath(path)) continue;

    if (
      (path.endsWith(".pem") || path.endsWith(".key") || /\/org-signing\//.test(path)) &&
      !path.includes("signing-key-meta")
    ) {
      out.push({ kind: "key_material", path });
      continue;
    }

    if (
      /\/data\/chat\/(threads|command-plans|tower-plans)\//.test(path) ||
      /\/records\/executive\//.test(path)
    ) {
      out.push({ kind: "chat_runtime", path });
      continue;
    }

    if (
      /\/data\/finance\/(payroll|bank-accounts|bank-statements)\.yaml$/.test(path) &&
      !isAllowedDemoTenant(path)
    ) {
      out.push({ kind: "finance_ledger", path });
    }
  }
  return out;
}
