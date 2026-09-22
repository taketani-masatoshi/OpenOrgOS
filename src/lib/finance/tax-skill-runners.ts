/**
 * Shared runners for JP tax module skills (thin CLI wrappers).
 */
import type { SkillRunOptions } from "../../commands/skills.js";
import {
  runTaxCalendar,
  runTaxConsumptionCalc,
  runTaxConsumptionCheck,
  runTaxDepreciation,
  runTaxGaps,
} from "../../commands/tax.js";
import {
  assessInvoiceRegistration,
  assessQualifiedInvoiceIssuance,
  formatInvoiceRegistrationMarkdown,
  formatQualifiedInvoiceIssuanceMarkdown,
} from "./invoice-qualified.js";
import { currentDate } from "../utils.js";
import {
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "./fiscal-year.js";
import { buildSolePropBlueReturn } from "./sole-prop-blue-return.js";
import { buildSolePropIncomeTaxReturnDraft } from "./sole-prop-income-tax-return.js";

export function runJpCorporateTaxReturnSkill(_opts: SkillRunOptions): void {
  runTaxCalendar({});
  console.log("");
  runTaxGaps({});
  console.log("");
  runTaxDepreciation({});
}

export function runJpConsumptionTaxReturnSkill(opts: SkillRunOptions): void {
  runTaxConsumptionCheck({});
  const period = opts.month ?? currentDate().slice(0, 7);
  console.log("");
  runTaxConsumptionCalc({ period });
}

export function runJpInvoiceRegistrationSkill(_opts: SkillRunOptions): void {
  const result = assessInvoiceRegistration();
  console.log(formatInvoiceRegistrationMarkdown(result));
}

export function runJpQualifiedInvoiceIssueSkill(_opts: SkillRunOptions): void {
  const result = assessQualifiedInvoiceIssuance();
  console.log(formatQualifiedInvoiceIssuanceMarkdown(result));
}

export function runJpWithholdingPaymentSkill(opts: SkillRunOptions): void {
  runTaxCalendar({ today: opts.month ? `${opts.month}-01` : undefined });
}

/** Sole-prop blue return + income-tax advisor draft (does not file). */
export function runJpIndividualIncomeTaxSkill(opts: SkillRunOptions): void {
  const month = opts.month ?? opts.period ?? currentDate().slice(0, 7);
  const fy = resolveFiscalYear(resolveCompanyFiscalYearEndMonth(), month);
  console.log(JSON.stringify(buildSolePropBlueReturn(fy), null, 2));
  console.log("");
  console.log(JSON.stringify(buildSolePropIncomeTaxReturnDraft(fy), null, 2));
}
