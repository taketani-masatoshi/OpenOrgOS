import {
  cleaningReportSchema,
  cleaningReportsFileSchema,
  type CleaningReport,
} from "../../../../schemas/hospitality-ops.js";
import { getClock } from "../../../../src/lib/runtime-context.js";
import { resolveTenantPath } from "../../../../src/lib/tenant.js";
import { currentDate, readYamlFile, writeYamlFile } from "../../../../src/lib/utils.js";
import { defaultHospitalityPropertyId, loadStays, upsertStay } from "./ops-lib.js";

export const CLEANING_REPORTS_REL = "data/operations/cleaning-reports.yaml";

function emptyFile() {
  return cleaningReportsFileSchema.parse({ version: 1, reports: [] });
}

export function loadCleaningReports() {
  const path = resolveTenantPath(CLEANING_REPORTS_REL);
  try {
    return readYamlFile(path, cleaningReportsFileSchema);
  } catch {
    return emptyFile();
  }
}

export function saveCleaningReports(file: ReturnType<typeof loadCleaningReports>): void {
  writeYamlFile(resolveTenantPath(CLEANING_REPORTS_REL), cleaningReportsFileSchema.parse(file));
}

function nextReportId(stayId: string): string {
  return `CLN-${stayId}-${currentDate().replace(/-/g, "")}`;
}

export function cleaningOrder(stayId: string, vendorRef?: string): CleaningReport {
  const stay = loadStays().stays.find((s) => s.id === stayId);
  if (!stay) throw new Error(`stay not found: ${stayId}`);
  const file = loadCleaningReports();
  const existing = file.reports.find((r) => r.stay_id === stayId && r.status !== "accepted");
  const now = getClock().nowIso();
  const report = cleaningReportSchema.parse({
    ...existing,
    id: existing?.id ?? nextReportId(stayId),
    stay_id: stayId,
    property_id: stay.property_id,
    vendor_ref: vendorRef ?? existing?.vendor_ref,
    status: "pending",
    updated_at: now,
  });
  const reports = existing
    ? file.reports.map((r) => (r.id === report.id ? report : r))
    : [...file.reports, report];
  saveCleaningReports({ version: 1, reports });
  upsertStay({ ...stay, cleaning_status: "ordered" });
  return report;
}

export function cleaningComplete(stayId: string): CleaningReport {
  const file = loadCleaningReports();
  const report = file.reports.find((r) => r.stay_id === stayId);
  if (!report) throw new Error(`cleaning report not found for ${stayId}`);
  const updated = cleaningReportSchema.parse({
    ...report,
    status: "submitted",
    submitted_on: currentDate(),
    updated_at: getClock().nowIso(),
  });
  saveCleaningReports({
    version: 1,
    reports: file.reports.map((r) => (r.id === updated.id ? updated : r)),
  });
  return updated;
}

export function cleaningReportUpdate(
  stayId: string,
  patch: { driveFolderUrl?: string; photoPathRefs?: string[] }
): CleaningReport {
  const file = loadCleaningReports();
  const report = file.reports.find((r) => r.stay_id === stayId);
  if (!report) throw new Error(`cleaning report not found for ${stayId}`);
  const updated = cleaningReportSchema.parse({
    ...report,
    drive_folder_url: patch.driveFolderUrl ?? report.drive_folder_url,
    photo_path_refs: patch.photoPathRefs ?? report.photo_path_refs,
    status: "submitted",
    submitted_on: report.submitted_on ?? currentDate(),
    updated_at: getClock().nowIso(),
  });
  saveCleaningReports({
    version: 1,
    reports: file.reports.map((r) => (r.id === updated.id ? updated : r)),
  });
  return updated;
}

export function cleaningAccept(stayId: string): CleaningReport {
  const file = loadCleaningReports();
  const report = file.reports.find((r) => r.stay_id === stayId);
  if (!report) throw new Error(`cleaning report not found for ${stayId}`);
  const updated = cleaningReportSchema.parse({
    ...report,
    status: "accepted",
    accepted_on: currentDate(),
    updated_at: getClock().nowIso(),
  });
  saveCleaningReports({
    version: 1,
    reports: file.reports.map((r) => (r.id === updated.id ? updated : r)),
  });
  const stay = loadStays().stays.find((s) => s.id === stayId);
  if (stay) upsertStay({ ...stay, cleaning_status: "done" });
  return updated;
}

export function cleaningIssue(stayId: string, summary: string, liability?: CleaningReport["liability"]): CleaningReport {
  const file = loadCleaningReports();
  const report = file.reports.find((r) => r.stay_id === stayId);
  if (!report) throw new Error(`cleaning report not found for ${stayId}`);
  const updated = cleaningReportSchema.parse({
    ...report,
    status: "issue",
    issue_summary: summary,
    liability: liability ?? report.liability ?? "unclear",
    updated_at: getClock().nowIso(),
  });
  saveCleaningReports({
    version: 1,
    reports: file.reports.map((r) => (r.id === updated.id ? updated : r)),
  });
  return updated;
}

export function cleaningMessage(stayId: string, direction: "out" | "in", summary: string): CleaningReport {
  const file = loadCleaningReports();
  const report = file.reports.find((r) => r.stay_id === stayId);
  if (!report) throw new Error(`cleaning report not found for ${stayId}`);
  const updated = cleaningReportSchema.parse({
    ...report,
    vendor_messages: [
      ...report.vendor_messages,
      { at: getClock().nowIso(), direction, summary },
    ],
    updated_at: getClock().nowIso(),
  });
  saveCleaningReports({
    version: 1,
    reports: file.reports.map((r) => (r.id === updated.id ? updated : r)),
  });
  return updated;
}

export function listCleaningReportsDue(): CleaningReport[] {
  return loadCleaningReports().reports.filter((r) => r.status === "submitted" || r.status === "issue");
}
