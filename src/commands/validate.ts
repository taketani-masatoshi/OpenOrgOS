import { validateAll } from "../lib/data.js";
import { syncActiveContext } from "../lib/context-manifest.js";
import { runIntegrityChecks, integrityErrorsOnly, type IntegrityIssue } from "../lib/integrity.js";
import { appendAuditEvent } from "../lib/audit-log.js";
import { printStaleDependencyWarnings } from "./deps.js";
import { runSecurityChecks } from "../lib/security-validate.js";

export interface ValidateOptions {
  warnings?: boolean;
  strict?: boolean;
  deps?: boolean;
  security?: boolean;
}

export function runValidate(opts: ValidateOptions = {}): void {
  const result = validateAll();
  const integrityErrors = result.ok ? integrityErrorsOnly(runIntegrityChecks()) : [];
  const securityIssues = opts.security
    ? runSecurityChecks().filter((i) => i.level === "error")
    : [];
  const allErrors = [
    ...result.errors,
    ...integrityErrors.map((i) => ({ file: i.file, message: i.message })),
    ...securityIssues.map((i) => ({ file: i.file, message: i.message })),
  ];

  if (allErrors.length === 0) {
    console.log("✓ All data files are valid.");
    const { contextPath } = syncActiveContext();
    console.log(`✓ Active context synced (${contextPath}).`);
    appendAuditEvent({ event: "validate", ref: "ok", detail: contextPath });
    printWarnings(runIntegrityChecks());
    if (opts.security) {
      const sec = runSecurityChecks();
      const warnings = sec.filter((i) => i.level === "warning");
      if (warnings.length) {
        console.log(`\n⚠ Security ${warnings.length} warning(s):`);
        for (const w of warnings) console.log(`  ${w.file}: ${w.message}`);
      }
      console.log("✓ Security checks passed.");
    }
    if (opts.deps) {
      printStaleDependencyWarnings();
    }
    process.exit(0);
  }

  console.error("✗ Validation failed:");
  for (const err of allErrors) {
    console.error(`  ${err.file}: ${err.message}`);
  }
  process.exit(1);
}

function printWarnings(issues: IntegrityIssue[]): void {
  const warnings = issues.filter((i) => i.level === "warning");
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} warning(s):`);
    for (const w of warnings) {
      console.log(`  ${w.file}: ${w.message}`);
    }
  }
}
