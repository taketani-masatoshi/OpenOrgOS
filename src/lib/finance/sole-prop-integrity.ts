/**
 * Validate gates for jp_sole_proprietor_blue_return (hard-fail when module enabled).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadTenantConfig } from "../tenant.js";
import { loadEnabledModulesSafe } from "../modules.js";
import { getDataDir } from "../utils.js";
import { assessEntityModuleMismatches } from "./entity-module-guards.js";
import {
  assessBlueReturnSetup,
  loadBlueReturnSetup,
} from "./sole-proprietor-clarify.js";
import { assessRulesFreshness } from "./sole-prop-rules-freshness.js";
import { assessSolePropYearEnd } from "./sole-prop-year-end.js";
import { unmappedBlueReturnExpenseCodes } from "./sole-proprietor-blue-return.js";

export type SolePropIntegrityIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

function moduleEnabled(): boolean {
  return loadEnabledModulesSafe().some((m) => m.id === "jp_sole_proprietor_blue_return");
}

export function solePropBlueReturnIntegrityIssues(): SolePropIntegrityIssue[] {
  const issues: SolePropIntegrityIssue[] = [];
  let entity: string | undefined;
  try {
    entity = loadTenantConfig().entity_form;
  } catch {
    return issues;
  }

  for (const w of assessEntityModuleMismatches()) {
    issues.push({
      level: "error",
      file: "tenant.yaml / modules.yaml",
      message: `entity-module: ${w}`,
    });
  }

  if (!moduleEnabled()) return issues;

  if (entity !== "sole_proprietorship") {
    /* mismatch already covered above when kk+module */
    return issues;
  }

  const setupPath = "data/finance/blue-return-setup.yaml";
  const assessment = assessBlueReturnSetup(loadBlueReturnSetup());
  if (assessment.file_missing || !assessment.ready) {
    issues.push({
      level: "error",
      file: setupPath,
      message: assessment.file_missing
        ? "blue-return-setup.yaml 未作成 — sole-prop-blue setup clarify / apply が必要"
        : `blue-return-setup 未充足: ${assessment.missing.join(", ")}`,
    });
  }

  const claimAccounting = join(getDataDir(), "finance", "expense-claim-accounting.yaml");
  if (existsSync(claimAccounting)) {
    issues.push({
      level: "warning",
      file: "data/finance/expense-claim-accounting.yaml",
      message:
        "個人事業主では事業経費の正本経路は sole-prop-blue expense-intake（仕訳 append）。expense-claim は従業員精算向け — 混用に注意",
    });
  }

  for (const f of assessRulesFreshness()) {
    issues.push({
      level: f.level,
      file: f.file,
      message: f.message,
    });
  }

  const yearEnd = assessSolePropYearEnd();
  for (const i of yearEnd.issues) {
    issues.push({
      level: i.level,
      file: i.file,
      message: i.hint ? `${i.message} — ${i.hint}` : i.message,
    });
  }

  const unmapped = unmappedBlueReturnExpenseCodes();
  if (unmapped.length > 0) {
    issues.push({
      level: "warning",
      file: "data/finance/blue-return-expense-map.yaml",
      message: `経費科目が決算書マップ未記載（雑費へ集約）: ${unmapped.join(", ")}`,
    });
  }

  return issues;
}
