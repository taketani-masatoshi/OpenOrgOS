/**
 * Indirect-tax close gate.
 * The ledger is shared. Only Japan + vat_credit runs the consumption-tax engine.
 */
import { loadChartOfAccounts } from "../../data.js";
import { buildConsumptionTaxSummary, runConsumptionTaxCheck } from "../consumption-tax.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import {
  assertJapaneseFinanceEngine,
  JP_TAX_PROFILE_REQUIRED,
} from "../jp-engine-guard.js";
import {
  resolveIndirectTaxCapability,
  type IndirectTaxEngineId,
} from "./capability.js";

export const INDIRECT_TAX_ENGINE_UNINSTALLED = "indirect tax engine not installed";
export const INDIRECT_TAX_NONE = "no indirect tax";
export { JP_TAX_PROFILE_REQUIRED };
export type { IndirectTaxEngineId };

export type JpIndirectTaxEngine = {
  missingLineTaxCodes(month: string): string[];
  summarize(month: string): {
    issues?: Array<{ severity: string; message: string }>;
  };
  profileBlocking(): Array<{ message: string }>;
};

export type IndirectTaxCloseResult = {
  pass: boolean;
  detail: string;
  label: string;
  engine: IndirectTaxEngineId;
};

export function assertJpTaxProfile(): void {
  assertJapaneseFinanceEngine(JP_TAX_PROFILE_REQUIRED);
}

export function missingLineTaxCodes(month: string): string[] {
  const types = new Map(
    loadChartOfAccounts().accounts.map((account) => [account.code, account.type])
  );
  const missing: string[] = [];
  for (const entry of loadJournalEntries().entries) {
    if (!entry.occurred_at.startsWith(month)) continue;
    for (const line of entry.lines) {
      const type = types.get(line.account_code);
      if (type !== "revenue" && type !== "expense") continue;
      if (!line.tax_category) {
        missing.push(`${entry.entry_id}:${line.account_code}`);
      }
    }
  }
  return missing;
}

function defaultJpEngine(): JpIndirectTaxEngine {
  return {
    missingLineTaxCodes,
    summarize: (month) => {
      // The summary reports invalid input by throwing; it has no issues field.
      buildConsumptionTaxSummary({ period: month });
      return {};
    },
    profileBlocking: () =>
      runConsumptionTaxCheck().issues.filter((issue) => issue.severity === "blocking"),
  };
}

function evaluateJpClose(month: string, engine: JpIndirectTaxEngine): IndirectTaxCloseResult {
  const missing = engine.missingLineTaxCodes(month);
  if (missing.length > 0) {
    return {
      pass: false,
      detail: `missing tax_category ${missing.join(", ")}`,
      label: "消費税集計",
      engine: "jp",
    };
  }
  try {
    const summaryErrors = (engine.summarize(month).issues ?? []).filter(
      (issue) => issue.severity === "error"
    );
    const profileErrors = engine.profileBlocking();
    if (summaryErrors.length > 0 || profileErrors.length > 0) {
      return {
        pass: false,
        detail: [...summaryErrors, ...profileErrors].map((issue) => issue.message).join("; "),
        label: "消費税集計",
        engine: "jp",
      };
    }
  } catch (error) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
      label: "消費税集計",
      engine: "jp",
    };
  }
  return { pass: true, detail: "ok", label: "消費税集計", engine: "jp" };
}

export function evaluateIndirectTaxClose(
  month: string,
  engine: JpIndirectTaxEngine = defaultJpEngine()
): IndirectTaxCloseResult {
  const capability = resolveIndirectTaxCapability();
  if (capability.engine === "jp" && capability.installed) {
    return evaluateJpClose(month, engine);
  }
  if (capability.engine === "none") {
    return {
      pass: true,
      detail: INDIRECT_TAX_NONE,
      label: "間接税",
      engine: "none",
    };
  }
  return {
    pass: false,
    detail: capability.detail || INDIRECT_TAX_ENGINE_UNINSTALLED,
    label: "間接税",
    engine: capability.engine === "uninstalled" ? "uninstalled" : capability.engine,
  };
}
