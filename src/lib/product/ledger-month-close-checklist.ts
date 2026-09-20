/**
 * Month-close checklist for Workbench.
 * `ready` matches evaluateMonthlyCloseGates().can_lock (period lock is separate).
 * Missing bank file is not a lock blocker and is represented as a skipped gate.
 */
import { listBankReconciliationWorkbench } from "../finance/bank-reconcile-apply.js";
import { evaluateMonthlyCloseGates } from "../finance/monthly-close.js";
import { latestLockForMonth } from "../finance/period-lock.js";
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
  const evaluation = evaluateMonthlyCloseGates(target);
  const lock = latestLockForMonth(target);
  const locked = lock?.status === "locked";
  const integrityErrors = evaluation.validate_errors.slice(0, 12);
  const fixHints = buildFixHints(integrityErrors);
  const bankImported = evaluation.items.find((item) => item.id === "bank-imported");
  const bankMissing = bankImported?.level === "skip";
  const workbench = bankMissing
    ? { unmatched_count: 0, unmatched: [], proposals: [] }
    : listBankReconciliationWorkbench(evaluation.as_of);
  const unmatchedSamples = workbench.unmatched
    .filter((row) => row.date.slice(0, 7) === target)
    .slice(0, 5)
    .map((row) => {
      const proposal = workbench.proposals.find(
        (item) => item.bank_statement_id === row.id,
      );
      return {
        bank_statement_id: row.id,
        amount: row.amount,
        description: `${row.date} ${row.direction}`,
        ...(proposal ? { suggested_ar_ap_id: proposal.ar_ap_id } : {}),
      };
    });

  const items: MonthCloseCheckItem[] = evaluation.items.map((item) => ({
    id: item.id,
    label: item.label,
    pass: item.pass,
    detail: item.detail,
    scroll_target:
      item.id === "bank-imported" || item.id === "bank-unmatched"
        ? item.pass || item.level === "skip"
          ? undefined
          : "sectionReconcile"
        : item.pass || item.level !== "error"
          ? undefined
          : "sectionClose",
  }));
  items.push({
    id: "period-locked",
    label: `期間 ${target} がロック済み`,
    pass: locked,
    detail: locked ? `locked by ${lock?.by ?? "?"}` : "unlocked",
    actions: locked ? undefined : ["チェック完了後に期間ロックを実行"],
    scroll_target: locked ? undefined : "sectionClose",
  });

  return {
    month: target,
    checked_at: getClock().now().toISOString(),
    ready: evaluation.can_lock,
    checklist_complete: evaluation.can_lock,
    period_locked: locked,
    items,
    integrity_errors: integrityErrors,
    fix_hints: fixHints,
    unmatched_samples: unmatchedSamples,
  };
}
