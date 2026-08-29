/**
 * Month-close checklist for Workbench — unmatched bank, unlocked period, validate.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runValidateReport } from "../../commands/validate.js";
import { listBankReconciliationWorkbench } from "../finance/bank-reconcile-apply.js";
import { latestLockForMonth } from "../finance/period-lock.js";
import { getDataDir } from "../utils.js";
import { getClock } from "../runtime-context.js";

export type MonthCloseCheckItem = {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
  actions?: string[];
  scroll_target?: string;
};

export type MonthCloseChecklist = {
  month: string;
  checked_at: string;
  ready: boolean;
  items: MonthCloseCheckItem[];
  integrity_errors: string[];
  fix_hints?: string[];
  unmatched_samples?: Array<{
    bank_statement_id: string;
    amount: number;
    description?: string;
    suggested_ar_ap_id?: string;
  }>;
  /** Checklist items complete (bank + unmatched + validate). Period lock is separate. */
  checklist_complete: boolean;
  period_locked: boolean;
};

function buildFixHints(errors: string[]): string[] {
  const hints: string[] = [];
  for (const err of errors) {
    const lower = err.toLowerCase();
    if (lower.includes("unknown account") || lower.includes("account code")) {
      hints.push("勘定科目コードを確認し、手動仕訳または COA を修正してください");
    } else if (lower.includes("balanced") || lower.includes("借貸")) {
      hints.push("仕訳の借方・貸方合計が一致するよう修正してください");
    } else if (lower.includes("schema") || lower.includes("yaml")) {
      hints.push("データファイルの形式エラーを解消してください（管理者に連絡）");
    } else if (lower.includes("bank") || lower.includes("statement")) {
      hints.push("銀行明細の取込・消込状態を確認してください");
    } else if (lower.includes("journal") || lower.includes("仕訳")) {
      hints.push("該当仕訳を Today セクションで確認・修正してください");
    }
  }
  if (hints.length === 0 && errors.length > 0) {
    hints.push("エラー内容を確認し、該当データを修正してください");
  }
  return [...new Set(hints)].slice(0, 5);
}

function currentMonthKey(): string {
  const now = getClock().now();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthCloseChecklist(month?: string): MonthCloseChecklist {
  const target = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonthKey();
  const bankPath = join(getDataDir(), "finance", "bank-statements.yaml");
  const bankImported = existsSync(bankPath);
  const workbench = bankImported
    ? listBankReconciliationWorkbench()
    : { unmatched_count: 0, unmatched: [], proposals: [] };
  const lock = latestLockForMonth(target);
  const locked = lock?.status === "locked";
  const validate = runValidateReport({ warnings: true });
  const integrityErrors = validate.issues
    .filter((i) => i.severity === "error")
    .slice(0, 12)
    .map((e) => `${e.path}: ${e.message}`);
  const fixHints = buildFixHints(integrityErrors);

  const unmatchedSamples = workbench.unmatched.slice(0, 5).map((row) => {
    const proposal = workbench.proposals.find(
      (p) => p.bank_statement_id === row.id,
    );
    return {
      bank_statement_id: row.id,
      amount: row.amount,
      description: `${row.date} ${row.direction}`,
      ...(proposal ? { suggested_ar_ap_id: proposal.ar_ap_id } : {}),
    };
  });

  const items: MonthCloseCheckItem[] = [
    {
      id: "bank-imported",
      label: "銀行明細を取込済み",
      pass: bankImported,
      detail: bankImported ? "ok" : "bank statements not imported",
      actions: bankImported ? undefined : ["消込セクションで CSV を取込"],
      scroll_target: bankImported ? undefined : "sectionReconcile",
    },
    {
      id: "bank-unmatched",
      label: "銀行明細の未消込なし",
      pass: bankImported && workbench.unmatched_count === 0,
      detail: bankImported
        ? `${workbench.unmatched_count} unmatched`
        : "bank statements not imported",
      actions:
        bankImported && workbench.unmatched_count > 0
          ? ["未消込明細を確認し、消込を承認"]
          : undefined,
      scroll_target:
        bankImported && workbench.unmatched_count > 0
          ? "sectionReconcile"
          : undefined,
    },
    {
      id: "period-locked",
      label: `期間 ${target} がロック済み`,
      pass: locked,
      detail: locked ? `locked by ${lock?.by ?? "?"}` : "unlocked",
      actions: locked ? undefined : ["チェック完了後に期間ロックを実行"],
      scroll_target: locked ? undefined : "sectionClose",
    },
    {
      id: "validate",
      label: "帳簿整合性チェック",
      pass: validate.ok,
      detail: validate.ok
        ? "ok"
        : `${validate.error_count} errors — 下記を解消`,
      actions: validate.ok ? undefined : ["整合性エラーとヒントを確認"],
      scroll_target: validate.ok ? undefined : "sectionClose",
    },
  ];

  const checklistComplete =
    items.find((i) => i.id === "bank-imported")!.pass &&
    items.find((i) => i.id === "bank-unmatched")!.pass &&
    items.find((i) => i.id === "validate")!.pass;

  return {
    month: target,
    checked_at: getClock().now().toISOString(),
    ready: checklistComplete,
    checklist_complete: checklistComplete,
    period_locked: locked,
    items,
    integrity_errors: integrityErrors,
    fix_hints: fixHints,
    unmatched_samples: unmatchedSamples,
  };
}
