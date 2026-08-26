import { validateAll } from "../lib/data.js";
import { syncActiveContext } from "../lib/context-manifest.js";
import { runIntegrityChecks, type IntegrityIssue } from "../lib/integrity.js";
import { appendAuditEvent } from "../lib/audit-log.js";
import { printStaleDependencyWarnings } from "./deps.js";
import { runSecurityChecks } from "../lib/security-validate.js";
import { basename, isAbsolute, relative } from "node:path";
import { getWorkspaceRoot } from "../lib/tenant.js";

export interface ValidateOptions {
  warnings?: boolean;
  strict?: boolean;
  deps?: boolean;
  security?: boolean;
}

export interface ValidateReportIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
  source: "schema" | "integrity" | "security";
  code?: string;
  fix_hints?: string[];
}

export interface ValidateReport {
  ok: boolean;
  error_count: number;
  warning_count: number;
  issues: ValidateReportIssue[];
}

function safeReportPath(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  if (!isAbsolute(file)) return normalized.replace(/^\.?\//, "");
  const rel = relative(getWorkspaceRoot(), file).replace(/\\/g, "/");
  return rel.startsWith("../") ? basename(file) : rel;
}

function safeReportMessage(message: string): string {
  return message
    .replaceAll(getWorkspaceRoot(), ".")
    .replace(/\b\d{7,}\b/g, "[redacted]");
}

/** Non-exiting, read-only validation API for operator tools and HTTP routes. */
export function runValidateReport(opts: ValidateOptions = {}): ValidateReport {
  let schema: ReturnType<typeof validateAll>;
  try {
    schema = validateAll();
  } catch (error) {
    schema = {
      ok: false,
      errors: [
        {
          file: "validation",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  let integrity: IntegrityIssue[] = [];
  if (schema.ok) {
    try {
      integrity = runIntegrityChecks();
    } catch (error) {
      integrity = [
        {
          level: "error",
          file: "cross-reference",
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  }
  let security: ReturnType<typeof runSecurityChecks> = [];
  if (opts.security) {
    try {
      security = runSecurityChecks();
    } catch (error) {
      security = [
        {
          level: "error",
          file: "security",
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  }
  const issues: ValidateReportIssue[] = [
    ...schema.errors.map((issue) => ({
      severity: "error" as const,
      path: safeReportPath(issue.file),
      message: safeReportMessage(issue.message),
      source: "schema" as const,
    })),
    ...integrity.map((issue) => ({
      severity: issue.level,
      path: safeReportPath(issue.file),
      message: safeReportMessage(issue.message),
      source: "integrity" as const,
      ...(issue.code ? { code: issue.code } : {}),
      ...(issue.fix_hints?.length
        ? { fix_hints: issue.fix_hints.map(safeReportMessage) }
        : {}),
    })),
    ...security.map((issue) => ({
      severity: issue.level,
      path: safeReportPath(issue.file),
      message: safeReportMessage(issue.message),
      source: "security" as const,
    })),
  ];
  const error_count = issues.filter((issue) => issue.severity === "error").length;
  const warning_count = issues.filter((issue) => issue.severity === "warning").length;
  return {
    ok: error_count === 0,
    error_count,
    warning_count,
    issues,
  };
}

export function runValidate(opts: ValidateOptions = {}): void {
  const report = runValidateReport(opts);
  const allErrors = report.issues.filter((issue) => issue.severity === "error");

  if (allErrors.length === 0) {
    console.log("✓ All data files are valid.");
    const { contextPath } = syncActiveContext();
    console.log(`✓ Active context synced (${contextPath}).`);
    appendAuditEvent({ event: "validate", ref: "ok", detail: contextPath });
    printWarnings(
      report.issues
        .filter((issue) => issue.source === "integrity")
        .map((issue) => ({
          level: issue.severity,
          file: issue.path,
          message: issue.message,
        }))
    );
    if (opts.security) {
      const warnings = report.issues.filter(
        (issue) => issue.source === "security" && issue.severity === "warning"
      );
      if (warnings.length) {
        console.log(`\n⚠ Security ${warnings.length} warning(s):`);
        for (const w of warnings) console.log(`  ${w.path}: ${w.message}`);
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
    console.error(`  ${err.path}: ${err.message}`);
  }
  process.exit(1);
}

function printWarnings(issues: IntegrityIssue[]): void {
  const warnings = issues.filter((i) => i.level === "warning");
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} warning(s):`);
    for (const w of warnings) {
      console.log(`  ${w.file}: ${w.message}`);
      for (const hint of w.fix_hints ?? []) {
        console.log(`    → 修正案: ${hint}`);
      }
    }
  }
}
