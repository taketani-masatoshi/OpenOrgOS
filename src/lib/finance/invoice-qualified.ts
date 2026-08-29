/**
 * JP qualified invoice registration and issuance checks (deterministic).
 */
import { loadTaxProfile } from "../data.js";
import type { ConsumptionTaxCheckIssue } from "./consumption-tax.js";

/** T + 13 digits (適格請求書発行事業者登録番号). */
export const JP_INVOICE_REGISTRATION_NUMBER_PATTERN = /^T\d{13}$/;

export type TaxProfileInvoiceSlice = {
  consumption_tax?: {
    status?: string;
    invoice_registered?: boolean;
    invoice_registration_number?: string;
    invoice_exempt_reconciled_basis?: string;
  };
};

export type InvoiceAssessmentResult = {
  invoice_registered: boolean;
  registration_number: string | null;
  issues: ConsumptionTaxCheckIssue[];
};

function profileSlice(): TaxProfileInvoiceSlice {
  return loadTaxProfile() as TaxProfileInvoiceSlice;
}

export function assessInvoiceRegistration(
  profile: TaxProfileInvoiceSlice = profileSlice(),
): InvoiceAssessmentResult {
  const ct = profile.consumption_tax;
  const registered = Boolean(ct?.invoice_registered);
  const number = ct?.invoice_registration_number?.trim() ?? null;
  const status = String(ct?.status ?? "TBD");
  const issues: ConsumptionTaxCheckIssue[] = [];

  if (registered && !number) {
    issues.push({
      severity: "blocking",
      code: "invoice_number_missing",
      message: "invoice_registered=true だが登録番号が未設定",
    });
  }

  if (number && !JP_INVOICE_REGISTRATION_NUMBER_PATTERN.test(number)) {
    issues.push({
      severity: "warning",
      code: "invoice_number_format",
      message: `登録番号形式が T+13桁ではない: ${number}`,
    });
  }

  if (
    registered &&
    status.includes("免税") &&
    !ct?.invoice_exempt_reconciled_basis
  ) {
    issues.push({
      severity: "warning",
      code: "invoice_exempt_reconcile",
      message:
        "インボイス登録済みかつ免税 — invoice_exempt_reconciled_basis 未記録（税理士確認）",
    });
  }

  if (!registered && number) {
    issues.push({
      severity: "warning",
      code: "number_without_flag",
      message: "登録番号があるが invoice_registered=false",
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      code: "ok",
      message: "登録番号・フラグの機械検証上の矛盾なし",
    });
  }

  return {
    invoice_registered: registered,
    registration_number: number,
    issues,
  };
}

export type QualifiedInvoiceIssuanceResult = InvoiceAssessmentResult & {
  can_issue_qualified_invoice: boolean;
};

export function assessQualifiedInvoiceIssuance(
  profile: TaxProfileInvoiceSlice = profileSlice(),
): QualifiedInvoiceIssuanceResult {
  const base = assessInvoiceRegistration(profile);
  const issues = [...base.issues.filter((i) => i.code !== "ok")];
  const ct = profile.consumption_tax;
  const status = String(ct?.status ?? "TBD");

  const blocking = base.issues.some((i) => i.severity === "blocking");
  const hasValidNumber =
    base.registration_number != null &&
    JP_INVOICE_REGISTRATION_NUMBER_PATTERN.test(base.registration_number);

  if (!base.invoice_registered) {
    issues.push({
      severity: "blocking",
      code: "not_registered",
      message: "適格請求書発行には invoice_registered=true が必要",
    });
  }

  if (status === "TBD") {
    issues.push({
      severity: "warning",
      code: "status_tbd",
      message: "消費税区分未確定 — 請求書の税率表示を確定してから発行",
    });
  }

  if (
    base.invoice_registered &&
    status.includes("免税") &&
    !ct?.invoice_exempt_reconciled_basis
  ) {
    issues.push({
      severity: "warning",
      code: "exempt_issue_basis",
      message:
        "免税事業者として適格請求書を発行する根拠（invoice_exempt_reconciled_basis）を記録",
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      code: "ok",
      message: "適格請求書発行前提チェック — 機械検証上の矛盾なし",
    });
  }

  return {
    ...base,
    issues,
    can_issue_qualified_invoice:
      base.invoice_registered && hasValidNumber && !blocking,
  };
}

export function formatInvoiceRegistrationMarkdown(
  result: InvoiceAssessmentResult,
): string {
  return [
    "# インボイス登録 · T 番号整合",
    "",
    `- invoice_registered: ${result.invoice_registered ? "true" : "false"}`,
    `- 登録番号: ${result.registration_number ?? "未設定"}`,
    "",
    "## 所見",
    ...result.issues.map((i) => `- [${i.severity}] ${i.code}: ${i.message}`),
  ].join("\n");
}

export function formatQualifiedInvoiceIssuanceMarkdown(
  result: QualifiedInvoiceIssuanceResult,
): string {
  return [
    "# 適格請求書発行前提チェック",
    "",
    `- 発行可能（機械判定）: ${result.can_issue_qualified_invoice ? "はい" : "いいえ"}`,
    `- 登録番号: ${result.registration_number ?? "未設定"}`,
    "",
    "## 所見",
    ...result.issues.map((i) => `- [${i.severity}] ${i.code}: ${i.message}`),
    "",
    "次: 請求書テンプレに登録番号 · 税率 · 区分を反映（Finance / Contract Agent）",
  ].join("\n");
}
