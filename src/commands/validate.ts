import { validateAll } from "../lib/data.js";
import { runIntegrityChecks, integrityErrorsOnly, type IntegrityIssue } from "../lib/integrity.js";
import { printStaleDependencyWarnings } from "./deps.js";

export interface ValidateOptions {
  warnings?: boolean;
  strict?: boolean;
  deps?: boolean;
}

export function runValidate(opts: ValidateOptions = {}): void {
  const result = validateAll();
  const integrityErrors = result.ok ? integrityErrorsOnly(runIntegrityChecks()) : [];
  const allErrors = [
    ...result.errors,
    ...integrityErrors.map((i) => ({ file: i.file, message: i.message })),
  ];

  if (allErrors.length === 0) {
    console.log("✓ All data files are valid.");
    if (opts.warnings || opts.strict) {
      printWarnings(runIntegrityChecks());
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
