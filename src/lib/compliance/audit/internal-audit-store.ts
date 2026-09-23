import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  isoInternalAuditRunSchema,
  type IsoInternalAuditRun,
} from "../../../../schemas/iso-internal-audit.js";
import { appendJsonl, loadJsonl } from "../../jsonl-store.js";
import { tenantDataPath } from "../../tenant.js";
import { getDocsDir, writeMarkdownReport, writeTrackedFile } from "../../utils.js";
import { formatIsoInternalAuditReport } from "./internal-audit-report.js";

export const ISO_INTERNAL_AUDIT_LOG_REL = "data/compliance/iso-internal-audit.jsonl";

export function isoInternalAuditLogPath(): string {
  const fromEnv = process.env.ORGOS_ISO_AUDIT_LOG?.trim();
  if (fromEnv) {
    mkdirSync(dirname(fromEnv), { recursive: true });
    return fromEnv;
  }
  return tenantDataPath("compliance", "iso-internal-audit.jsonl");
}

export function isoInternalAuditLatestReportPath(): string {
  return join(getDocsDir(), "audit", "internal", "latest-iso-audit.md");
}

export function loadIsoInternalAuditRuns(): IsoInternalAuditRun[] {
  return loadJsonl(isoInternalAuditLogPath(), (raw) => isoInternalAuditRunSchema.parse(raw));
}

export function latestIsoInternalAuditRun(): IsoInternalAuditRun | undefined {
  return loadIsoInternalAuditRuns().at(-1);
}

export function persistIsoInternalAuditRun(
  run: IsoInternalAuditRun,
  opts: { writeReports?: boolean } = {}
): { logPath: string; reportPaths: string[] } {
  const logPath = isoInternalAuditLogPath();
  appendJsonl(logPath, run);
  const reportPaths: string[] = [];
  if (opts.writeReports === false) return { logPath, reportPaths };

  const previous = loadIsoInternalAuditRuns().at(-2);
  const markdown = formatIsoInternalAuditReport(run, previous);
  const date = run.timestamp.slice(0, 10);
  reportPaths.push(
    writeMarkdownReport(
      "agent-summaries/internal-audit",
      `iso-audit-${date}-${run.id}.md`,
      markdown
    )
  );
  const latest = isoInternalAuditLatestReportPath();
  mkdirSync(dirname(latest), { recursive: true });
  reportPaths.push(writeTrackedFile(latest, markdown));
  return { logPath, reportPaths };
}
