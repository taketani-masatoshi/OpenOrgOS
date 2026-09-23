import type {
  ForeignWorker,
  ForeignWorkersFile,
  StatusCatalogFile,
  WeeklyHoursFile,
} from "../../../../../../schemas/jp-visa-employment.js";
import {
  COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS,
  NO_PERIOD_OF_STAY_CODES,
  statutoryWorkAllowance,
} from "./statutory.js";

export interface ForeignWorkerDataset {
  workers: ForeignWorkersFile;
  weeks: WeeklyHoursFile;
  catalog: StatusCatalogFile;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

/** カタログの work_allowed は入管法19条1項の区分（statutory.ts）と一致しなければならない。 */
export function validateCatalogAgainstStatute(catalog: StatusCatalogFile): string[] {
  const issues = findDuplicates(catalog.statuses.map((entry) => entry.code)).map(
    (code) => `status-catalog: duplicate status code ${code}`
  );
  for (const entry of catalog.statuses) {
    const statutory = statutoryWorkAllowance(entry.code);
    if (statutory === null) {
      issues.push(`status-catalog: ${entry.code} is not a statutory status of residence code`);
      continue;
    }
    if (entry.work_allowed !== statutory) {
      issues.push(`status-catalog: ${entry.code} work_allowed ${entry.work_allowed} contradicts statute (${statutory})`);
    }
  }
  return issues;
}

export function validateCatalogJobCategories(catalog: StatusCatalogFile): string[] {
  const jobIds = catalog.job_categories.map((category) => category.id);
  const known = new Set(jobIds);
  const issues = findDuplicates(jobIds).map((id) => `status-catalog: duplicate job category ${id}`);
  for (const entry of catalog.statuses) {
    const referenced = [...entry.permitted_job_categories, ...entry.excluded_job_categories];
    for (const id of referenced.filter((jobId) => !known.has(jobId))) {
      issues.push(`status-catalog: ${entry.code} references unknown job category ${id}`);
    }
    for (const id of entry.permitted_job_categories.filter((jobId) => entry.excluded_job_categories.includes(jobId))) {
      issues.push(`status-catalog: ${entry.code} lists ${id} as both permitted and excluded`);
    }
  }
  return issues;
}

function validatePeriodOfStay(worker: ForeignWorker): string[] {
  const hasNoPeriod = NO_PERIOD_OF_STAY_CODES.has(worker.status_of_residence);
  if (hasNoPeriod && worker.period_expires_on) {
    return [`${worker.employee_id}: ${worker.status_of_residence} has no period of stay — use card_valid_until for card validity`];
  }
  if (!hasNoPeriod && !worker.period_expires_on) {
    return [`${worker.employee_id}: period_expires_on required for ${worker.status_of_residence}`];
  }
  return [];
}

function validateWorkerRecord(worker: ForeignWorker, catalog: StatusCatalogFile): string[] {
  const issues = validatePeriodOfStay(worker);
  if (!catalog.statuses.some((entry) => entry.code === worker.status_of_residence)) {
    issues.push(`${worker.employee_id}: unknown status_of_residence ${worker.status_of_residence}`);
  }
  if (!catalog.job_categories.some((category) => category.id === worker.job_category)) {
    issues.push(`${worker.employee_id}: unknown job_category ${worker.job_category}`);
  }
  if (worker.separated_on && worker.separated_on < worker.hired_on) {
    issues.push(`${worker.employee_id}: separated_on before hired_on`);
  }
  const permission = worker.permission_to_engage;
  const limit = permission.weekly_limit_hours;
  if (permission.scope === "comprehensive" && limit !== undefined && limit > COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS) {
    issues.push(
      `${worker.employee_id}: comprehensive permission weekly_limit_hours ${limit} exceeds ${COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS}`
    );
  }
  return issues;
}

export function validateWorkers(workers: ForeignWorkersFile, catalog: StatusCatalogFile): string[] {
  const duplicateIssues = findDuplicates(workers.workers.map((worker) => worker.employee_id)).map(
    (id) => `foreign-workers: duplicate employee_id ${id}`
  );
  return [...duplicateIssues, ...workers.workers.flatMap((worker) => validateWorkerRecord(worker, catalog))];
}

export function validateWeeklyHours(weeks: WeeklyHoursFile, workers: ForeignWorkersFile): string[] {
  const knownIds = new Set(workers.workers.map((worker) => worker.employee_id));
  const duplicateIssues = findDuplicates(weeks.weeks.map((week) => `${week.employee_id}@${week.week_start}`)).map(
    (key) => `weekly-hours: duplicate week ${key}`
  );
  const recordIssues = weeks.weeks.flatMap((week) => {
    const issues: string[] = [];
    if (!knownIds.has(week.employee_id)) issues.push(`weekly-hours: unknown employee_id ${week.employee_id}`);
    if (week.max_daily_hours !== undefined && week.max_daily_hours > week.hours) {
      issues.push(`weekly-hours: ${week.employee_id}@${week.week_start} max_daily_hours exceeds weekly hours`);
    }
    return issues;
  });
  return [...duplicateIssues, ...recordIssues];
}

export function collectValidationIssues(dataset: ForeignWorkerDataset): string[] {
  return [
    ...validateCatalogAgainstStatute(dataset.catalog),
    ...validateCatalogJobCategories(dataset.catalog),
    ...validateWorkers(dataset.workers, dataset.catalog),
    ...validateWeeklyHours(dataset.weeks, dataset.workers),
  ];
}
