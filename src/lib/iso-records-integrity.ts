import type { IntegrityIssue } from "./integrity.js";
import { checkRecordsForStandard, loadRecordSpecs, recordRelPath } from "./iso-records.js";
import { loadEnabledIsoIds } from "./tenant-standards.js";

/**
 * Surface record faults in `orgos validate`, so a register that no longer meets
 * its specification is caught during routine checks rather than only when an
 * audit is run.
 */
export function collectIsoRecordIntegrityIssues(): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const standard of loadEnabledIsoIds()) {
    const spec = loadRecordSpecs(standard);
    if (!spec) continue;
    for (const report of checkRecordsForStandard(standard)) {
      const definition = spec.records.find((r) => r.file === report.file);
      const file = definition ? recordRelPath(standard, definition) : report.file;
      for (const issue of report.issues) {
        const where = issue.row ? ` (${issue.row}行目)` : "";
        // Always a warning here. An unfilled or inconsistent record is a
        // conformity gap, not broken data, and `orgos validate` gates commits
        // for every tenant — including ones that have only just been handed the
        // blank forms. The gate for conformity is `iso records check --strict`.
        issues.push({
          level: "warning",
          file,
          message: `${issue.message}${where}`,
          fix_hints: [
            `orgos iso records check --iso ${standard} で全件を確認する`,
            "記録を記入するか、統制の適用範囲を見直す",
          ],
        });
      }
    }
  }
  return issues;
}
