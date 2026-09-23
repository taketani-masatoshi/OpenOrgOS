import type {
  TakkenLicenseFile,
  TakkenOffice,
  TakkenTransaction,
} from "../../../../../../schemas/jp-takken.js";
import { findTakkenshi } from "./transaction-rules.js";

export interface TakkenDataFiles {
  license: TakkenLicenseFile | null;
  offices: readonly TakkenOffice[] | null;
  transactions: readonly TakkenTransaction[] | null;
  hasSettings: boolean;
  hasSources: boolean;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

function missingFileIssues(files: TakkenDataFiles): string[] {
  const issues: string[] = [];
  if (!files.license) issues.push("license.yaml missing");
  if (!files.offices) issues.push("offices.yaml missing");
  if (!files.transactions) issues.push("transactions.yaml missing");
  if (!files.hasSettings) issues.push("settings.yaml missing");
  if (!files.hasSources) issues.push("sources.yaml missing");
  return issues;
}

export function licenseIssues(license: TakkenLicenseFile): string[] {
  const issues: string[] = [];
  const core = license.license;
  if (core.licensor_kind === "governor" && !core.licensor_prefecture) {
    issues.push("license: governor licence requires licensor_prefecture");
  }
  if (core.expires_on <= (core.valid_from ?? core.issued_on)) {
    issues.push("license: expires_on must be after valid_from / issued_on");
  }
  for (const id of duplicates(license.changes.map((change) => change.id))) {
    issues.push(`changes: duplicate id ${id}`);
  }
  return issues;
}

export function officeIssues(offices: readonly TakkenOffice[]): string[] {
  const issues: string[] = [];
  for (const id of duplicates(offices.map((office) => office.office_id))) {
    issues.push(`offices: duplicate office_id ${id}`);
  }
  const mainCount = offices.filter((office) => office.kind === "main").length;
  if (mainCount !== 1) issues.push(`offices: exactly one main office required (found ${mainCount})`);
  const dedicatedIds = offices.flatMap((office) =>
    office.takkenshi.filter((t) => t.dedicated).map((t) => t.employee_id)
  );
  for (const id of duplicates(dedicatedIds)) {
    issues.push(`offices: ${id} is dedicated (専任) at more than one office`);
  }
  return issues;
}

function transactionAmountIssues(tx: TakkenTransaction): string[] {
  if (tx.kind === "lease") {
    const issues = tx.monthly_rent_yen === undefined ? [`${tx.id}: lease requires monthly_rent_yen`] : [];
    return tx.low_cost_vacant_house ? [...issues, `${tx.id}: low_cost_vacant_house applies to sale/exchange only`] : issues;
  }
  return tx.price_yen === undefined ? [`${tx.id}: ${tx.kind} requires price_yen`] : [];
}

function transactionReferenceIssues(tx: TakkenTransaction, offices: readonly TakkenOffice[]): string[] {
  const issues: string[] = [];
  if (!offices.some((office) => office.office_id === tx.office_id)) {
    issues.push(`${tx.id}: unknown office_id ${tx.office_id}`);
  }
  for (const employeeId of [tx.explained_35_by, tx.signed_37_by]) {
    if (employeeId && !findTakkenshi(offices, employeeId)) {
      issues.push(`${tx.id}: ${employeeId} not in takkenshi roster (offices.yaml)`);
    }
  }
  return issues;
}

export function transactionIssues(
  transactions: readonly TakkenTransaction[],
  offices: readonly TakkenOffice[]
): string[] {
  const issues = duplicates(transactions.map((tx) => tx.id)).map((id) => `transactions: duplicate id ${id}`);
  for (const tx of transactions) {
    issues.push(...transactionAmountIssues(tx), ...transactionReferenceIssues(tx, offices));
  }
  return issues;
}

export function findTakkenDataIssues(files: TakkenDataFiles, jurisdictionCode: string): string[] {
  const issues = missingFileIssues(files);
  if (jurisdictionCode !== "JP") issues.push(`tenant jurisdiction ${jurisdictionCode} — jp_takken is JP-only`);
  if (files.license) issues.push(...licenseIssues(files.license));
  if (files.offices) issues.push(...officeIssues(files.offices));
  if (files.transactions && files.offices) issues.push(...transactionIssues(files.transactions, files.offices));
  return issues;
}
