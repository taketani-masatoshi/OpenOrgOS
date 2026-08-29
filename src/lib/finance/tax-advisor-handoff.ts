/**
 * Tax advisor handoff — correspondence draft generation (CEO approval gate).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCorrespondenceDraft } from "../correspondence/draft.js";
import { loadCompany, loadTaxProfile, loadYojitsuFyPlan } from "../data.js";
import { summarizeTaxFilingGaps, tryLoadTaxFilingGaps } from "./tax-filing-gaps.js";
import { getDocsDir, currentDate } from "../utils.js";
import { getCliOperatorContext } from "../console-auth/cli-operator.js";
import { DEFAULT_CORRESPONDENCE_AGENT_ID } from "../correspondence/cli-labels.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  lastDayOfMonth,
  resolveCompanyFiscalYearEndMonth,
  resolveDefaultFiscalYear,
} from "./fiscal-year.js";
import { fiscalYearNumber } from "../pdf.js";
import { unpostedMonthlyPlIssues } from "./ledger/unposted-months.js";
import { buildTaxCalendarPortfolio } from "./tax-calendar-portfolio.js";
import { remittanceObligationFromCashflowCategory } from "./remittance-from-calendar.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import {
  buildComparativeBalanceSheet,
  buildComparativeProfitLoss,
} from "./ledger/comparative-statements.js";

export type TaxHandoffDraftResult = {
  draft_id: string;
  approval_id?: string;
  to: string;
  subject: string;
  fiscal_year: string;
  deferred_count: number;
  attachment_refs: string[];
};

export type TaxHandoffContent = {
  to: string;
  advisor_name: string;
  firm: string;
  company_name: string;
  fiscal_year: string;
  term_number: number;
  period_label: string;
  subject: string;
  body: string;
  attachment_refs: string[];
  deferred_count: number;
  slug: string;
  handoff_rel: string;
};

function taxAdvisorContact(): { to: string; name: string; firm: string } {
  try {
    const profile = loadTaxProfile() as {
      contacts?: { tax_advisor?: { email?: string; name?: string; firm?: string } };
    };
    const advisor = profile.contacts?.tax_advisor;
    return {
      to: advisor?.email?.trim() || "tax-advisor@example.com",
      name: advisor?.name?.trim() || "税理士",
      firm: advisor?.firm?.trim() || "税理士事務所",
    };
  } catch {
    return {
      to: "tax-advisor@example.com",
      name: "税理士",
      firm: "税理士事務所",
    };
  }
}

function optionalDoc(rel: string): string | undefined {
  return existsSync(join(getDocsDir(), rel)) ? `docs/${rel}` : undefined;
}

export function buildTaxAdvisorHandoffContent(input?: {
  fiscalYear?: string;
}): TaxHandoffContent {
  const company = loadCompany();
  const fiscalYear = resolveDefaultFiscalYear(input?.fiscalYear);
  const fyKey = fiscalYear.toLowerCase();
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const periodFrom =
    yojitsu?.period_from ?? fiscalYearStartDate(fiscalYear, endMonth);
  const periodTo = yojitsu?.period_to ?? fiscalYearEndDate(fiscalYear, endMonth);
  const termNumber = fiscalYearNumber(company.established_date, periodTo);
  const periodLabel = `${periodFrom.replace(/-/g, "/")}〜${periodTo.replace(/-/g, "/")}`;
  const { to, name, firm } = taxAdvisorContact();
  const summary = summarizeTaxFilingGaps(tryLoadTaxFilingGaps());
  const deferredCount = summary.items.filter((g) => g.status === "deferred").length;
  const handoffRel = `company/tax/${fyKey}-tax-advisor-handoff.md`;
  const periodToDate =
    periodTo.length === 7 ? lastDayOfMonth(periodTo) : periodTo.slice(0, 10);
  const unposted = unpostedMonthlyPlIssues(periodToDate.slice(0, 7));
  const trial = buildTrialBalance({ asOf: periodToDate });
  const accounts = resolveJournalSourceAccounts();
  const taxLines = [
    accounts.consumption_tax_payable,
    accounts.consumption_tax_receivable,
  ]
    .filter(Boolean)
    .map((code) => {
      const bal = trial.rows.find((r) => r.account_code === code)?.balance_yen ?? 0;
      return `・${code}: ${bal.toLocaleString()} 円`;
    });
  let remitLines: string[] = [];
  try {
    const portfolio = buildTaxCalendarPortfolio({ today: periodToDate });
    remitLines = portfolio.rows
      .filter((row) => remittanceObligationFromCashflowCategory(row.cashflow_category))
      .slice(0, 8)
      .map(
        (row) =>
          `・${row.deadline} ${row.tax}` +
          (row.amount_estimate_jpy != null
            ? `（概算 ${row.amount_estimate_jpy.toLocaleString()} 円）`
            : ""),
      );
  } catch {
    remitLines = [];
  }

  let priorCompareLines: string[] = [];
  try {
    const cmpBs = buildComparativeBalanceSheet({
      asOf: periodToDate,
      fiscalYear,
    });
    const cmpPl = buildComparativeProfitLoss({
      fiscalYear,
      asOf: periodToDate,
    });
    priorCompareLines = [
      `・資産合計: 当期 ${cmpBs.total_assets_yen.current.toLocaleString()} / 前期 ${cmpBs.total_assets_yen.prior.toLocaleString()}（差 ${cmpBs.total_assets_yen.delta.toLocaleString()}）`,
      `・純利益: 当期 ${cmpPl.net_profit.current.toLocaleString()} / 前期 ${cmpPl.net_profit.prior.toLocaleString()}（差 ${cmpPl.net_profit.delta.toLocaleString()}）`,
      `・prior_as_of: ${cmpBs.prior_as_of}`,
    ];
  } catch {
    priorCompareLines = ["・（前期比較を算出できませんでした）"];
  }

  const attachmentRefs = [
    optionalDoc(`company/${fyKey}-tax-advisor-checklist.md`),
    optionalDoc(handoffRel),
    optionalDoc(`company/${fyKey}-keisansyorui.md`),
    "data/finance/tax-profile.yaml",
    "data/finance/fixed-assets.yaml",
    "data/finance/tax-filing-gaps.yaml",
    `orgos ledger export --template account-breakdown-csv --as-of ${periodToDate}`,
  ].filter((ref): ref is string => Boolean(ref));

  const body = `${name} 様

お世話になっております。${company.name} です。

第${termNumber}期（${periodLabel}）の税務申告準備について、社内データ整備が完了しましたので
ご確認をお願いいたします。

【添付・共有資料】
${attachmentRefs.map((ref) => `・${ref}`).join("\n")}

【未計上月（月次 YAML と JE-MPL の差）】
${unposted.length > 0 ? unposted.map((m) => `・${m}`).join("\n") : "・なし（GL 稼働月は計上済み）"}

【消費税・法定納付の目安】
${taxLines.length > 0 ? taxLines.join("\n") : "・（該当科目なし）"}
${remitLines.length > 0 ? remitLines.join("\n") : "・納付カレンダー行なし"}

【前期比較サマリ】
${priorCompareLines.join("\n")}

【特にご確認いただきたい点】
1. 期末現預金と試算表 1100 の突合
2. 消費税（仮受/仮払）と納付仕訳
3. 固定資産台帳と減価償却仕訳
4. 勘定科目内訳明細書（売掛・買掛）

申告ギャップ: 税理士回答待ち ${deferredCount} 件（OrgOS tax-filing-gaps.yaml）。

ご多忙のところ恐れ入りますが、初回ご回答可能な目安をお知らせください。

${company.name}`;

  return {
    to,
    advisor_name: name,
    firm,
    company_name: company.name,
    fiscal_year: fiscalYear,
    term_number: termNumber,
    period_label: periodLabel,
    subject: `【${company.name}】第${termNumber}期 税務確認依頼`,
    body,
    attachment_refs: attachmentRefs,
    deferred_count: deferredCount,
    slug: `tax-advisor-${fyKey}`,
    handoff_rel: handoffRel,
  };
}

export function runTaxAdvisorHandoffDraft(opts?: {
  operator?: string;
  json?: boolean;
  fiscalYear?: string;
}): TaxHandoffDraftResult {
  const content = buildTaxAdvisorHandoffContent({ fiscalYear: opts?.fiscalYear });
  const operator =
    opts?.operator ??
    getCliOperatorContext()?.record.operator_id ??
    DEFAULT_CORRESPONDENCE_AGENT_ID;

  const { draft, approvalId } = createCorrespondenceDraft({
    channel: "email",
    body: content.body,
    createdBy: operator,
    to: content.to,
    subject: content.subject,
    notes: `tax-advisor-handoff · ${content.firm} · ${content.fiscal_year} · deferred ${content.deferred_count} · ${currentDate()}`,
    slug: content.slug,
    proposeApproval: true,
  });

  const result: TaxHandoffDraftResult = {
    draft_id: draft.draft_id,
    approval_id: approvalId,
    to: content.to,
    subject: draft.subject ?? content.subject,
    fiscal_year: content.fiscal_year,
    deferred_count: content.deferred_count,
    attachment_refs: content.attachment_refs,
  };

  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log(`✓ tax handoff draft ${draft.draft_id} → ${content.to}`);
  if (approvalId) {
    console.log(`  approval: ${approvalId} (pending_approval)`);
    console.log(`  next: orgos org approval approve --id ${approvalId} --approver "<CEO>" --reviewed`);
    console.log(`  then: orgos mail outbound correspondence send --id ${draft.draft_id}`);
  }
  console.log(`  path: docs/executive/correspondence-drafts/${draft.draft_id}.yaml`);
  console.log(`  deferred gaps: ${content.deferred_count} 件（送付後も tax readiness で可視化）`);
  for (const ref of content.attachment_refs) {
    console.log(`  attach: ${ref}`);
  }

  return result;
}

/** Print handoff package paths for manual send (no draft write). */
export function formatTaxHandoffChecklist(fiscalYear?: string): string {
  const content = buildTaxAdvisorHandoffContent({ fiscalYear });
  const handoffPath = join(getDocsDir(), content.handoff_rel);
  let excerpt = "";
  try {
    excerpt = readFileSync(handoffPath, "utf-8").split("\n").slice(0, 12).join("\n");
  } catch {
    excerpt = "(handoff file not found)";
  }
  const summary = summarizeTaxFilingGaps(tryLoadTaxFilingGaps());
  return [
    "# Tax advisor handoff checklist",
    "",
    `- company: ${content.company_name}`,
    `- fiscal_year: ${content.fiscal_year}`,
    `- handoff: docs/${content.handoff_rel}`,
    `- deferred: ${summary.items.filter((g) => g.status === "deferred").length}`,
    `- open: ${summary.open}`,
    "",
    excerpt,
  ].join("\n");
}
