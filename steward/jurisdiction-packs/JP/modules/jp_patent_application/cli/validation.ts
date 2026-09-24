import type {
  PatentApplication,
  PatentFieldMapFile,
  PatentHolidaysFile,
  PatentSourcesFile,
  PatentSpecification,
} from "../../../../../../schemas/jp-patent.js";
import { findHolidayCalendarIssues } from "./calendar.js";

export interface PatentDataBundle {
  applications: readonly PatentApplication[] | null;
  specifications: ReadonlyMap<string, PatentSpecification>;
  sources: PatentSourcesFile | null;
  fieldMap: PatentFieldMapFile | null;
  holidays: PatentHolidaysFile | null;
  missingTemplates: readonly string[];
}

function missingFileIssues(bundle: PatentDataBundle): string[] {
  const required: Array<[string, unknown]> = [
    ["patent-registry.yaml", bundle.applications],
    ["sources.yaml", bundle.sources],
    ["field-map.yaml", bundle.fieldMap],
    ["holidays.yaml", bundle.holidays],
  ];
  return required.filter(([, loaded]) => loaded === null).map(([file]) => `${file} missing`);
}

function duplicateIdIssues(applications: readonly PatentApplication[]): string[] {
  const seen = new Set<string>();
  return applications.flatMap((app) => {
    if (!seen.has(app.id)) {
      seen.add(app.id);
      return [];
    }
    return [`duplicate application id ${app.id}`];
  });
}

function dateOrderIssues(app: PatentApplication): string[] {
  const filingDate = app.filed_on ?? app.planned_filing_on;
  if (!filingDate) return [];
  const later: Array<[string, string | undefined]> = [
    ["exam_requested_on", app.exam_requested_on],
    ["published_on", app.published_on],
    ["allowance_served_on", app.allowance_served_on],
    ["registered_on", app.registered_on],
  ];
  const beforeFiling = later.filter(([, date]) => date !== undefined && date < filingDate);
  const lateBases = app.priority_claims.filter((c) => c.base_filed_on >= filingDate);
  return [
    ...beforeFiling.map(([key, date]) => `${app.id}: ${key} ${date} が出願日 ${filingDate} より前`),
    ...lateBases.map((c) => `${app.id}: 優先権の基礎出願日 ${c.base_filed_on} が出願日 ${filingDate} 以後`),
  ];
}

function specificationIssues(bundle: PatentDataBundle): string[] {
  return [...bundle.specifications.entries()]
    .filter(([appId, spec]) => spec.application_id !== appId)
    .map(([appId, spec]) => `specifications/${appId}.yaml: application_id ${spec.application_id} が不一致`);
}

function feeSourceIssues(sources: PatentSourcesFile): string[] {
  const sourceIds = new Set(sources.sources.map((s) => s.id));
  return sources.fees
    .filter((fee) => !sourceIds.has(fee.source_id))
    .map((fee) => `sources.yaml: fee ${fee.id} の source_id ${fee.source_id} が sources にない`);
}

export function validatePatentData(bundle: PatentDataBundle, jurisdictionCode?: string): string[] {
  const applications = bundle.applications ?? [];
  const jurisdictionIssues =
    jurisdictionCode !== undefined && jurisdictionCode !== "JP"
      ? [`tenant jurisdiction ${jurisdictionCode} — jp_patent_application is JP-only`]
      : [];
  return [
    ...jurisdictionIssues,
    ...missingFileIssues(bundle),
    ...duplicateIdIssues(applications),
    ...applications.flatMap(dateOrderIssues),
    ...specificationIssues(bundle),
    ...(bundle.sources ? feeSourceIssues(bundle.sources) : []),
    ...(bundle.holidays ? findHolidayCalendarIssues(bundle.holidays) : []),
    ...bundle.missingTemplates.map((template) => `form template missing: ${template}`),
  ];
}
