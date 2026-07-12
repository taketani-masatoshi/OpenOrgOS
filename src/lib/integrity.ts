import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import type { Contract, Property, Loan } from "../../schemas/index.js";
import {
  arApLedgerFileSchema,
  bankStatementFileSchema,
  collectionTermsFileSchema,
  paymentCalendarFileSchema,
  reconciliationEventFileSchema,
  type ArApLedgerFile,
  type BankStatementFile,
  type CollectionTermsFile,
  type PaymentCalendarFile,
  type ReconciliationEventFile,
} from "../../schemas/jp-bank-corporate.js";
import type { ChartOfAccounts } from "../../schemas/finance.js";
import {
  loadAllData,
  loadChartOfAccounts,
  loadContracts,
  loadLoans,
  loadProperties,
  loadEmployees,
  loadYojitsuPlan,
  loadCashBalance,
  resolveCashBalanceTotal,
} from "./data.js";
import { facilityPublicSchema, facilitySecretsSchema } from "../../schemas/operations.js";
import { classificationRegistrySchema } from "../../schemas/classification.js";
import { runClassificationChecks } from "./classification.js";
import { computeControlGaps } from "./control-framework.js";
import { loadExecutiveCalendar } from "./data.js";
import { detectUnsyncedCalendarEvents } from "./executive-calendar-sync.js";
import { validatePeerContactRegistry } from "./secretary/validate-peer-contact-registry.js";
import { loadMailConfig } from "./correspondence/mail-config.js";
import { getMailConfigPath } from "./correspondence/paths.js";
import { loadMailTriageQueue } from "./correspondence/mail-triage-queue.js";
import { resolveImapCredentials } from "./correspondence/imap-credentials.js";
import { getDataDir, readYamlFile, getClassificationRegistryYaml, resolveTenantPath, SCRATCH_DIR } from "./utils.js";
import {
  listOperationsModules,
  resolveModuleSecretsPath,
  isSkeletonTenant,
} from "./ops-config.js";
import { loadModulesFile } from "./modules.js";
import { getModuleTier } from "./module-readiness.js";
import { AGENT_CATALOG_PATH, validateAgentCatalog } from "./agent-catalog.js";
import { validateCapabilityManifestDrift } from "./agent-capability-sync.js";
import { AGENT_CAPABILITY_MANIFEST_PATH } from "./agent-capability.js";
import { validateAgentAlignment } from "./agent-alignment.js";
import { validateArApPaidAmount } from "../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/ar-ap-amounts.js";
import { validatePolicyMirrors } from "./operator-policy.js";
import { replayReconciliation } from "./jp-bank-corporate/reconciliation.js";

export interface IntegrityIssue {
  level: "error" | "warning";
  file: string;
  message: string;
}

interface JpBankIntegrityInput {
  paymentCalendar?: unknown;
  arApLedger?: unknown;
  collectionTerms?: unknown;
  bankStatements?: unknown;
  reconciliationEvents?: unknown;
  chartOfAccounts?: ChartOfAccounts;
}

const JP_BANK_FILES = {
  paymentCalendar: "data/finance/payment-calendar.yaml",
  arApLedger: "data/finance/ar-ap-ledger.yaml",
  collectionTerms: "data/finance/collection-terms.yaml",
  bankStatements: "data/finance/bank-statements.yaml",
  reconciliationEvents: "data/finance/reconciliation-events.yaml",
  chartOfAccounts: "data/finance/chart-of-accounts.yaml",
} as const;

function validCalendarDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10);
}

function expectedDueDate(
  bookedDate: string,
  term: CollectionTermsFile["rules"][number]
): string {
  if (term.days_after_month_end != null) {
    const [year, month] = bookedDate.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year!, month!, 0))
      .toISOString()
      .slice(0, 10);
    return addCalendarDays(monthEnd, term.days_after_month_end);
  }
  return addCalendarDays(bookedDate, term.days_after_booking);
}

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "schema validation failed";
  const location = issue.path.length ? ` at ${issue.path.join(".")}` : "";
  return `schema invalid${location}: ${issue.message}`;
}

function duplicateIdIssues(
  rows: Array<{ id: string }>,
  file: string,
  label: string
): IntegrityIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  }
  return [...duplicates].sort().map((id) => ({
    level: "error" as const,
    file,
    message: `duplicate ${label} id ${id}`,
  }));
}

/** Pure JP bank schema/cross-file checks for validate/report callers and tests. */
export function validateJpBankCorporateIntegrity(
  input: JpBankIntegrityInput
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const parse = <T>(
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    value: unknown,
    file: string
  ): T | undefined => {
    if (value === undefined) return undefined;
    const result = schema.safeParse(value);
    if (!result.success) {
      issues.push({ level: "error", file, message: zodMessage(result.error) });
      return undefined;
    }
    return result.data;
  };

  const calendar = parse<PaymentCalendarFile>(
    paymentCalendarFileSchema,
    input.paymentCalendar,
    JP_BANK_FILES.paymentCalendar
  );
  const ledger = parse<ArApLedgerFile>(
    arApLedgerFileSchema,
    input.arApLedger,
    JP_BANK_FILES.arApLedger
  );
  const terms = parse<CollectionTermsFile>(
    collectionTermsFileSchema,
    input.collectionTerms,
    JP_BANK_FILES.collectionTerms
  );
  const bankStatements = parse<BankStatementFile>(
    bankStatementFileSchema,
    input.bankStatements,
    JP_BANK_FILES.bankStatements
  );
  const reconciliationEvents = parse<ReconciliationEventFile>(
    reconciliationEventFileSchema,
    input.reconciliationEvents,
    JP_BANK_FILES.reconciliationEvents
  );

  if (calendar) {
    issues.push(
      ...duplicateIdIssues(
        calendar.entries,
        JP_BANK_FILES.paymentCalendar,
        "payment calendar"
      )
    );
    for (const entry of calendar.entries) {
      if (!validCalendarDate(entry.date)) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.paymentCalendar,
          message: `${entry.id}: date is not a real calendar date`,
        });
      }
      if (
        entry.direction === "transfer" &&
        (!entry.account_id ||
          !entry.counterparty_account_id ||
          entry.account_id === entry.counterparty_account_id)
      ) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.paymentCalendar,
          message: `${entry.id}: transfer requires distinct account_id and counterparty_account_id`,
        });
      }
    }
  }

  if (terms) {
    issues.push(
      ...duplicateIdIssues(
        terms.rules,
        JP_BANK_FILES.collectionTerms,
        "collection term"
      )
    );
  }

  if (ledger) {
    issues.push(
      ...duplicateIdIssues(ledger.entries, JP_BANK_FILES.arApLedger, "AR/AP")
    );
    const termsById = new Map(terms?.rules.map((term) => [term.id, term]) ?? []);
    for (const entry of ledger.entries) {
      if (!validCalendarDate(entry.booked_date) || !validCalendarDate(entry.due_date)) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.arApLedger,
          message: `${entry.id}: booked_date or due_date is not a real calendar date`,
        });
        continue;
      }
      if (entry.due_date < entry.booked_date) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.arApLedger,
          message: `${entry.id}: due_date precedes booked_date`,
        });
      }
      for (const message of validateArApPaidAmount(entry)) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.arApLedger,
          message,
        });
      }
      if (!entry.collection_term_id) continue;
      const term = termsById.get(entry.collection_term_id);
      if (!term) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.arApLedger,
          message: `${entry.id}: collection_term_id ${entry.collection_term_id} not found`,
        });
        continue;
      }
      if (term.kind !== entry.kind) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.arApLedger,
          message: `${entry.id}: collection term kind ${term.kind} does not match ${entry.kind}`,
        });
      }
      if (
        entry.due_date_source === "collection-term" &&
        entry.due_date !== expectedDueDate(entry.booked_date, term)
      ) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.arApLedger,
          message: `${entry.id}: due_date does not match collection term`,
        });
      }
    }
  }

  if (bankStatements) {
    issues.push(
      ...duplicateIdIssues(
        bankStatements.entries,
        JP_BANK_FILES.bankStatements,
        "bank statement"
      )
    );
    for (const entry of bankStatements.entries) {
      if (!validCalendarDate(entry.date)) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.bankStatements,
          message: `${entry.id}: date is not a real calendar date`,
        });
      }
    }
    issues.push(
      ...duplicateIdIssues(
        bankStatements.import_batches,
        JP_BANK_FILES.bankStatements,
        "bank statement import batch"
      )
    );
    const entryIds = new Set(bankStatements.entries.map((entry) => entry.id));
    for (const batch of bankStatements.import_batches) {
      for (const id of batch.entry_ids) {
        if (!entryIds.has(id)) {
          issues.push({
            level: "error",
            file: JP_BANK_FILES.bankStatements,
            message: `${batch.id}: entry_id ${id} not found`,
          });
        }
      }
    }
  }

  if (ledger && bankStatements && reconciliationEvents) {
    for (const event of reconciliationEvents.events) {
      if (!validCalendarDate(event.effective_date)) {
        issues.push({
          level: "error",
          file: JP_BANK_FILES.reconciliationEvents,
          message: `${event.id}: effective_date is not a real calendar date`,
        });
      }
    }
    const state = replayReconciliation(
      ledger.entries,
      bankStatements.entries,
      reconciliationEvents.events
    );
    for (const message of state.errors) {
      issues.push({
        level: "error",
        file: JP_BANK_FILES.reconciliationEvents,
        message,
      });
    }
  }

  const chartIds = new Set(input.chartOfAccounts?.accounts.map((account) => account.code) ?? []);
  if (input.chartOfAccounts) {
    const checkChartRef = (
      rows: Array<{ id: string; chart_account_id?: string }>,
      file: string
    ) => {
      for (const row of rows) {
        if (row.chart_account_id && !chartIds.has(row.chart_account_id)) {
          issues.push({
            level: "error",
            file,
            message: `${row.id}: chart_account_id ${row.chart_account_id} not found in chart-of-accounts`,
          });
        }
      }
    };
    checkChartRef(calendar?.entries ?? [], JP_BANK_FILES.paymentCalendar);
    checkChartRef(ledger?.entries ?? [], JP_BANK_FILES.arApLedger);
    checkChartRef(terms?.rules ?? [], JP_BANK_FILES.collectionTerms);
    checkChartRef(bankStatements?.entries ?? [], JP_BANK_FILES.bankStatements);
  }

  return issues;
}

function runJpBankCorporateIntegrityChecks(): IntegrityIssue[] {
  let enabled = false;
  try {
    enabled = loadModulesFile().modules.some(
      (mod) =>
        mod.enabled &&
        (mod.id === "jp_bank_corporate" || mod.agent === "jp_bank_corporate")
    );
  } catch {
    return [];
  }
  if (!enabled) return [];

  const issues: IntegrityIssue[] = [];
  const values: JpBankIntegrityInput = {};
  const missingLevel: IntegrityIssue["level"] =
    getModuleTier("jp_bank_corporate") === "production_ready"
      ? "error"
      : "warning";
  const specs = [
    ["paymentCalendar", JP_BANK_FILES.paymentCalendar, paymentCalendarFileSchema],
    ["arApLedger", JP_BANK_FILES.arApLedger, arApLedgerFileSchema],
    ["collectionTerms", JP_BANK_FILES.collectionTerms, collectionTermsFileSchema],
  ] as const;
  for (const [key, file, schema] of specs) {
    const path = resolveTenantPath(file);
    if (!existsSync(path)) {
      issues.push({
        level: missingLevel,
        file,
        message:
          "enabled module data is not materialized; copy the module activation seed",
      });
      continue;
    }
    try {
      values[key] = readYamlFile(path, schema);
    } catch (error) {
      issues.push({
        level: "error",
        file,
        message:
          error instanceof z.ZodError
            ? zodMessage(error)
            : error instanceof Error
              ? error.message
              : String(error),
      });
    }
  }
  const optionalSpecs = [
    ["bankStatements", JP_BANK_FILES.bankStatements, bankStatementFileSchema],
    [
      "reconciliationEvents",
      JP_BANK_FILES.reconciliationEvents,
      reconciliationEventFileSchema,
    ],
  ] as const;
  for (const [key, file, schema] of optionalSpecs) {
    const path = resolveTenantPath(file);
    if (!existsSync(path)) continue;
    try {
      values[key] = readYamlFile(path, schema);
    } catch (error) {
      issues.push({
        level: "error",
        file,
        message:
          error instanceof z.ZodError
            ? zodMessage(error)
            : error instanceof Error
              ? error.message
              : String(error),
      });
    }
  }
  try {
    values.chartOfAccounts = loadChartOfAccounts();
  } catch {
    // validateAll owns the canonical chart-of-accounts schema error.
  }
  return [...issues, ...validateJpBankCorporateIntegrity(values)];
}

function docExists(relPath: string | undefined): boolean {
  if (!relPath) return false;
  return existsSync(resolveTenantPath(relPath));
}

export function validateAgentCatalogIntegrity(): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  try {
    issues.push(
      ...validateAgentCatalog().map((message) => ({
        level: "error" as const,
        file: AGENT_CATALOG_PATH,
        message,
      }))
    );
  } catch (error) {
    issues.push({
      level: "error",
      file: AGENT_CATALOG_PATH,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    for (const message of validateCapabilityManifestDrift()) {
      issues.push({
        level: "error",
        file: AGENT_CAPABILITY_MANIFEST_PATH,
        message,
      });
    }
  } catch (error) {
    issues.push({
      level: "error",
      file: AGENT_CAPABILITY_MANIFEST_PATH,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    for (const issue of validateAgentAlignment()) {
      issues.push({
        level: "error",
        file: `agent-alignment:${issue.source}`,
        message: issue.message,
      });
    }
  } catch (error) {
    issues.push({
      level: "error",
      file: "agent-alignment",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    for (const message of validatePolicyMirrors()) {
      issues.push({
        level: "error",
        file: "steward/rules/engineering",
        message,
      });
    }
  } catch (error) {
    issues.push({
      level: "error",
      file: "steward/rules/engineering",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return issues;
}

export function runIntegrityChecks(): IntegrityIssue[] {
  const issues: IntegrityIssue[] = validateAgentCatalogIntegrity();
  const skeleton = isSkeletonTenant();
  const push = (level: IntegrityIssue["level"], file: string, message: string) =>
    issues.push({ level, file, message });

  let data;
  try {
    data = loadAllData();
  } catch (e) {
    push("error", "cross-reference", e instanceof Error ? e.message : String(e));
    return issues;
  }

  const propertyIds = new Set(data.properties.map((p) => p.id));
  const propertyById = new Map(data.properties.map((p) => [p.id, p]));
  const contractById = new Map(data.contracts.map((c) => [c.id, c]));
  const loanById = new Map(data.loans.loans.map((l) => [l.id, l]));

  for (const c of data.contracts) {
    if (c.property_id && !propertyIds.has(c.property_id)) {
      push("error", `data/contracts/${c.id}.yaml`, `property_id ${c.property_id} not found`);
    }
    if (c.status === "executed" && !c.executed_date) {
      push("warning", `data/contracts/${c.id}.yaml`, "executed status but no executed_date");
    }
    if (c.status === "executed" && c.documents?.executed && !docExists(c.documents.executed)) {
      push("warning", `data/contracts/${c.id}.yaml`, `executed doc missing: ${c.documents.executed}`);
    }
    if (c.status === "draft" && c.documents?.enrollment && !docExists(c.documents.enrollment)) {
      push("warning", `data/contracts/${c.id}.yaml`, `enrollment doc missing: ${c.documents.enrollment}`);
    }
  }

  for (const plan of data.propertyRevenuePlan.rental) {
    if (!propertyIds.has(plan.property_id)) {
      push("error", "data/plans/property-revenue.yaml", `rental plan references unknown property ${plan.property_id}`);
    }
  }
  for (const plan of data.propertyRevenuePlan.hotel) {
    if (!propertyIds.has(plan.property_id)) {
      push("error", "data/plans/property-revenue.yaml", `hotel plan references unknown property ${plan.property_id}`);
    }
  }

  for (const p of data.properties) {
    if (p.financing) {
      const loan = loanById.get(p.financing);
      if (!loan) {
        push("error", `data/properties/${p.id}.yaml`, `financing ${p.financing} not found in loans.yaml`);
      } else {
        if (loan.property_id && loan.property_id !== p.id) {
          push("error", "data/finance/loans.yaml", `${loan.id} property_id ${loan.property_id} ≠ ${p.id}`);
        }
        if (p.acquisition_price !== undefined && loan.balance !== p.acquisition_price) {
          push(
            "warning",
            `data/properties/${p.id}.yaml`,
            `acquisition_price ${p.acquisition_price} ≠ loan balance ${loan.balance}`
          );
        }
      }
    }
  }

  for (const loan of data.loans.loans) {
    checkLoanRefs(loan, contractById, propertyById, push);
  }

  const yojitsu2026 = loadYojitsuPlan(2026);
  if (yojitsu2026 && yojitsu2026.months.length !== 12) {
    push("warning", "data/plans/yojitsu-2026.yaml", `expected 12 months, got ${yojitsu2026.months.length}`);
  }

  for (const mod of listOperationsModules()) {
    const publicRel = mod.operationsPublic;
    const publicFile = publicRel ?? `module:${mod.moduleId}:operations_public`;
    if (publicRel) {
      try {
        const ops = readYamlFile(resolveTenantPath(publicRel), facilityPublicSchema);
        if (ops.property_id && !propertyIds.has(ops.property_id)) {
          push("error", publicRel, `property_id ${ops.property_id} not found`);
        }
        for (const [, path] of Object.entries(ops.guest_docs ?? {})) {
          if (path && !docExists(path)) {
            push("warning", publicRel, `guest doc missing: ${path}`);
          }
        }
      } catch (e) {
        push("warning", publicRel, e instanceof Error ? e.message : String(e));
      }
    }

    const secretsRel = mod.operationsSecrets;
    if (!secretsRel) continue;
    const secretsPath = resolveModuleSecretsPath(mod.moduleId);
    if (secretsPath && existsSync(secretsPath)) {
      try {
        const secrets = readYamlFile(secretsPath, facilitySecretsSchema);
        const placeholders = Object.entries(secrets).filter(
          ([, v]) => typeof v === "string" && (v === "REPLACE_ME" || v === "TBD" || v.startsWith("TBD"))
        );
        if (placeholders.length) {
          push(
            "warning",
            secretsRel,
            `${placeholders.length} 項目が未入力（REPLACE_ME / TBD）`
          );
        }
      } catch (e) {
        push("warning", secretsRel, e instanceof Error ? e.message : String(e));
      }
    } else if (!skeleton) {
      push("warning", secretsRel, "未作成 — example をコピーして実値を記入");
    }
  }

  try {
    const cash = loadCashBalance();
    if (cash) {
      const total = resolveCashBalanceTotal(cash);
      if (cash.status === "template" && total == null && !skeleton) {
        push(
          "warning",
          "data/finance/cash-balance.yaml",
          "テンプレート — 残高入力後 status: confirmed に変更"
        );
      } else if (cash.status === "confirmed" && total == null) {
        push("warning", "data/finance/cash-balance.yaml", "confirmed だが total / accounts が未入力");
      }
    }
  } catch (e) {
    push("warning", "data/finance/cash-balance.yaml", e instanceof Error ? e.message : String(e));
  }

  try {
    const hr = loadEmployees();
    for (const emp of hr.employees) {
      if (emp.contract_id && !contractById.has(emp.contract_id)) {
        push("error", "data/hr/employees.yaml", `${emp.id} references unknown contract ${emp.contract_id}`);
      }
    }
  } catch (e) {
    push("warning", "data/hr/employees.yaml", e instanceof Error ? e.message : String(e));
  }

  try {
    readYamlFile(getClassificationRegistryYaml(), classificationRegistrySchema);
  } catch (e) {
    push(
      "error",
      "data/classification-registry.yaml",
      e instanceof Error ? e.message : String(e)
    );
  }

  const executiveYaml = [
    "calendar.yaml",
    "tasks.yaml",
    "one-on-ones.yaml",
    "external-contacts.yaml",
    "stakeholders.yaml",
    "mail-triage-queue.yaml",
  ] as const;
  for (const name of executiveYaml) {
    const rel = `data/executive/${name}`;
    const abs = resolveTenantPath(rel);
    if (!existsSync(abs)) {
      push(
        "warning",
        rel,
        `未作成 — \`cp ${name.replace(".yaml", ".yaml.example")} ${name}\`（[data/executive/00-README.md](data/executive/00-README.md)）`
      );
    }
  }

  const hasExecutiveData = executiveYaml.some((name) =>
    existsSync(resolveTenantPath(`data/executive/${name}`))
  );
  if (hasExecutiveData) {
    const stampPath = join(SCRATCH_DIR, "executive-backup-last.txt");
    if (!existsSync(stampPath)) {
      push(
        "warning",
        "scratch/executive-backup-last.txt",
        "executive 週次バックアップ未記録 — 初回: echo $(date +%Y-%m-%d) > scratch/executive-backup-last.txt（[backup-procedure.md](docs/executive/backup-procedure.md)）"
      );
    } else {
      const last = readFileSync(stampPath, "utf-8").trim().slice(0, 10);
      const lastMs = Date.parse(last + "T12:00:00");
      const ageDays = Math.floor((Date.now() - lastMs) / 86_400_000);
      if (!Number.isNaN(lastMs) && ageDays > 7) {
        push(
          "warning",
          "scratch/executive-backup-last.txt",
          `最終バックアップ ${last}（${ageDays} 日前）— 7 日超 · 週次 SSD バックアップを実施`
        );
      }
    }

    const calPath = resolveTenantPath("data/executive/calendar.yaml");
    if (existsSync(calPath)) {
      try {
        const unsynced = detectUnsyncedCalendarEvents(loadExecutiveCalendar().events);
        if (unsynced.length > 0) {
          push(
            "warning",
            "data/executive/calendar.yaml",
            `${unsynced.length} 件が google_event_id 未同期 — \`steward executive calendar push\` または pull --apply`
          );
        }
      } catch (e) {
        push("warning", "data/executive/calendar.yaml", e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (process.platform === "darwin") {
    try {
      const out = execFileSync("tmutil", ["latestbackup"], { encoding: "utf-8" }).trim();
      if (out) {
        const m = out.match(/(\d{4}-\d{2}-\d{2})/);
        if (m?.[1]) {
          const ageDays = Math.floor(
            (Date.now() - Date.parse(m[1] + "T12:00:00")) / 86_400_000
          );
          if (ageDays > 7) {
            push(
              "warning",
              "system:Time Machine",
              `最終バックアップ ${m[1]}（${ageDays} 日前）— executive SSD 週次と併用推奨`
            );
          }
        }
      }
    } catch {
      // tmutil unavailable — skip
    }
  }

  for (const ci of runClassificationChecks()) {
    push(ci.severity, "data/classification-registry.yaml", ci.message);
  }

  for (const pci of validatePeerContactRegistry()) {
    push(pci.level, pci.file, pci.message);
  }

  try {
    for (const gap of computeControlGaps()) {
      if (gap.gap_type === "maturity_below_target") {
        push(
          "warning",
          "data/compliance/controls.yaml",
          `${gap.control_id}: ${gap.detail} (${gap.primary_agent})`
        );
      }
    }
  } catch {
    // tenant or jurisdiction not configured — skip control checks
  }

  try {
    const mailConfig = loadMailConfig();
    if (mailConfig?.receive?.sync === "imap") {
      if (!mailConfig.receive.imap_host && !resolveImapCredentials()?.host) {
        push(
          "warning",
          getMailConfigPath(),
          "receive.sync=imap だが imap_host 未設定 — receive.imap_host または ORGOS_IMAP_HOST"
        );
      }
      if (!resolveImapCredentials()) {
        push(
          "warning",
          "records/executive/imap.env",
          "IMAP 資格情報未設定 — ORGOS_IMAP_USER/PASSWORD または SMTP 資格情報"
        );
      }
    }
    const queue = loadMailTriageQueue();
    for (const entry of queue.entries) {
      if (entry.subject.length > 500 || entry.from.length > 300) {
        push(
          "error",
          "data/executive/mail-triage-queue.yaml",
          `${entry.id}: queue フィールドが長すぎる — L2 本文混入の疑い`
        );
      }
      const emlAbs = resolveTenantPath(entry.eml_ref);
      if (!existsSync(emlAbs)) {
        push(
          "error",
          "data/executive/mail-triage-queue.yaml",
          `${entry.id}: eml_ref が存在しません (${entry.eml_ref})`
        );
      }
    }
  } catch {
    // correspondence optional on some tenants
  }

  issues.push(...runJpBankCorporateIntegrityChecks());

  return issues;
}

function checkLoanRefs(
  loan: Loan,
  contractById: Map<string, Contract>,
  propertyById: Map<string, Property>,
  push: (level: IntegrityIssue["level"], file: string, message: string) => void
): void {
  if (loan.property_id && !propertyById.has(loan.property_id)) {
    push("error", "data/finance/loans.yaml", `${loan.id} property_id ${loan.property_id} not found`);
  }
  if (loan.contract_id) {
    const ctr = contractById.get(loan.contract_id);
    if (!ctr) {
      push("error", "data/finance/loans.yaml", `${loan.id} contract_id ${loan.contract_id} not found`);
      return;
    }
    if (ctr.type !== "loan") {
      push("warning", "data/finance/loans.yaml", `${loan.id} linked contract ${loan.contract_id} type is ${ctr.type}`);
    }
    if (loan.property_id && ctr.property_id && loan.property_id !== ctr.property_id) {
      push("error", "data/finance/loans.yaml", `${loan.id} property_id ≠ contract ${loan.contract_id} property_id`);
    }
    if (ctr.compensation?.amount !== undefined && loan.balance !== ctr.compensation.amount) {
      push(
        "warning",
        "data/finance/loans.yaml",
        `${loan.id} balance ${loan.balance} ≠ contract amount ${ctr.compensation.amount}`
      );
    }
    if (loan.documents?.executed && !docExists(loan.documents.executed)) {
      push("warning", "data/finance/loans.yaml", `${loan.id} executed doc missing: ${loan.documents.executed}`);
    }
  }
}

export function integrityErrorsOnly(issues: IntegrityIssue[]): IntegrityIssue[] {
  return issues.filter((i) => i.level === "error");
}

export function summarizeIntegrity(issues: IntegrityIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
  };
}

/** Lightweight check used by status — no throws */
export function countDataFiles(): {
  properties: number;
  contracts: number;
  monthlyFinances: number;
  loans: number;
} {
  return {
    properties: loadProperties().length,
    contracts: loadContracts().length,
    monthlyFinances: loadAllData().monthlyFinances.length,
    loans: loadLoans().loans.length,
  };
}
