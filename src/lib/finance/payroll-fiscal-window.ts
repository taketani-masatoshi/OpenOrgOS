/**
 * Payroll vs books fiscal window (company FY / tax period).
 *
 * Resolution is strict: no silent default for fiscal year-end month.
 * Prefer tax-profile fiscal_year.period_from / period_to when present.
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getDataDir, getTenantDir } from "../utils.js";

export type PayrollFiscalWindow = {
  fiscal_year: string;
  period_from: string;
  period_to: string;
  source: "tax_period" | "company_fy" | "opts";
};

export type PayrollFiscalWindowOpts = {
  fiscalYear?: string;
  periodFrom?: string;
  periodTo?: string;
  /** Explicit FY end month (1–12). Required for company_fy when profiles omit it. */
  fiscalYearEndMonth?: number;
  /** Override as-of month for FY inference (YYYY-MM). Defaults to current UTC month. */
  asOfYm?: string;
  /** Optional tenant root (tests). Defaults to active tenant. */
  tenantDir?: string;
};

export type PayrollFiscalWindowErrorCode =
  | "missing_as_of"
  | "invalid_opts"
  | "end_month_conflict"
  | "unresolved_end_month"
  | "invalid_period";

export class PayrollFiscalWindowError extends Error {
  readonly code: PayrollFiscalWindowErrorCode;

  constructor(code: PayrollFiscalWindowErrorCode, message: string) {
    super(message);
    this.name = "PayrollFiscalWindowError";
    this.code = code;
  }
}

export type PayrollFiscalIntegrityIssue = {
  code: "payroll_fiscal_end_month_conflict" | "payroll_fiscal_window_unresolved";
  message: string;
};

type CompanyProfileLite = {
  fiscal_year_end_month?: number;
};

type TaxProfileLite = {
  period_from?: string;
  period_to?: string;
  end_month?: number;
  label?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function readYamlObject(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = YAML.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Normalize ISO date or YYYY-MM to YYYY-MM. */
export function toYearMonth(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);
  throw new PayrollFiscalWindowError(
    "invalid_opts",
    `Expected YYYY-MM or YYYY-MM-DD, got: ${value}`,
  );
}

/** Add calendar months to YYYY-MM. */
export function addMonthsYm(ym: string, delta: number): string {
  const base = toYearMonth(ym);
  const [ys, ms] = base.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const idx = y * 12 + (m - 1) + delta;
  const outY = Math.floor(idx / 12);
  const outM = (idx % 12) + 1;
  return `${outY}-${pad2(outM)}`;
}

export function fiscalYearStartMonth(endMonth: number): number {
  if (endMonth < 1 || endMonth > 12) {
    throw new PayrollFiscalWindowError(
      "unresolved_end_month",
      `Invalid fiscal year-end month: ${endMonth}`,
    );
  }
  return endMonth === 12 ? 1 : endMonth + 1;
}

export function normalizeFiscalYearLabel(fy: string): string {
  const m = /^FY?(\d{4})$/i.exec(fy.trim());
  if (!m) {
    throw new PayrollFiscalWindowError(
      "invalid_opts",
      `Invalid fiscal year "${fy}". Expected FY2026.`,
    );
  }
  return `FY${m[1]}`;
}

/**
 * Derive inclusive period for FY label + year-end month.
 * FY label year = calendar year of the FY start month.
 */
export function derivePeriodFromFiscalYear(
  fiscalYear: string,
  endMonth: number,
): { period_from: string; period_to: string } {
  const fy = normalizeFiscalYearLabel(fiscalYear);
  const year = Number(fy.slice(2));
  const startMonth = fiscalYearStartMonth(endMonth);
  if (startMonth === 1) {
    return { period_from: `${year}-01`, period_to: `${year}-12` };
  }
  return {
    period_from: `${year}-${pad2(startMonth)}`,
    period_to: `${year + 1}-${pad2(endMonth)}`,
  };
}

/** Infer FY label containing asOfYm. */
export function inferFiscalYearLabel(asOfYm: string, endMonth: number): string {
  const ym = toYearMonth(asOfYm);
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const startMonth = fiscalYearStartMonth(endMonth);
  if (startMonth === 1) return `FY${y}`;
  if (m >= startMonth) return `FY${y}`;
  return `FY${y - 1}`;
}

export function monthInPayrollWindow(
  ym: string,
  window: Pick<PayrollFiscalWindow, "period_from" | "period_to">,
): boolean {
  const month = toYearMonth(ym);
  return month >= window.period_from && month <= window.period_to;
}

export function currentUtcYm(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function readCompanyFiscalProfile(
  tenantDir?: string,
): CompanyProfileLite | null {
  const root = tenantDir ?? getTenantDir();
  const raw = readYamlObject(path.join(root, "data", "company.yaml"));
  if (!raw) return null;
  return {
    fiscal_year_end_month:
      typeof raw.fiscal_year_end_month === "number"
        ? raw.fiscal_year_end_month
        : undefined,
  };
}

export function readTaxFiscalProfile(tenantDir?: string): TaxProfileLite | null {
  const root = tenantDir ?? getTenantDir();
  const dataDir = tenantDir ? path.join(tenantDir, "data") : getDataDir();
  const raw = readYamlObject(path.join(dataDir, "finance", "tax-profile.yaml"));
  if (!raw) return null;
  const fy =
    raw.fiscal_year && typeof raw.fiscal_year === "object" && !Array.isArray(raw.fiscal_year)
      ? (raw.fiscal_year as Record<string, unknown>)
      : null;
  if (!fy) return null;
  return {
    period_from: typeof fy.period_from === "string" ? fy.period_from : undefined,
    period_to: typeof fy.period_to === "string" ? fy.period_to : undefined,
    end_month: typeof fy.end_month === "number" ? fy.end_month : undefined,
    label: typeof fy.label === "string" ? fy.label : undefined,
  };
}

function endMonthConflictMessage(companyEnd: number, taxEnd: number): string {
  return (
    `Fiscal year-end month conflict: company.yaml fiscal_year_end_month=${companyEnd} ` +
    `vs tax-profile.fiscal_year.end_month=${taxEnd}. Align both or pass periodFrom/periodTo.`
  );
}

function resolveEndMonths(opts: PayrollFiscalWindowOpts): {
  companyEnd?: number;
  taxEnd?: number;
  resolved?: number;
} {
  const company = readCompanyFiscalProfile(opts.tenantDir);
  const tax = readTaxFiscalProfile(opts.tenantDir);
  const companyEnd = company?.fiscal_year_end_month;
  const taxEnd = tax?.end_month;
  if (
    typeof companyEnd === "number" &&
    typeof taxEnd === "number" &&
    companyEnd !== taxEnd
  ) {
    throw new PayrollFiscalWindowError(
      "end_month_conflict",
      endMonthConflictMessage(companyEnd, taxEnd),
    );
  }
  const resolved =
    opts.fiscalYearEndMonth ?? companyEnd ?? taxEnd ?? undefined;
  return { companyEnd, taxEnd, resolved };
}

/**
 * Integrity issues for payroll fiscal window (no throw).
 * End-month conflict is reported alone (not also as unresolved).
 */
export function collectPayrollFiscalIntegrityIssues(
  opts: PayrollFiscalWindowOpts = {},
): PayrollFiscalIntegrityIssue[] {
  if (opts.periodFrom && opts.periodTo) return [];

  try {
    resolveEndMonths(opts);
  } catch (e) {
    if (e instanceof PayrollFiscalWindowError && e.code === "end_month_conflict") {
      return [
        {
          code: "payroll_fiscal_end_month_conflict",
          message: e.message,
        },
      ];
    }
    throw e;
  }

  if (!tryResolvePayrollFiscalWindow(opts)) {
    return [
      {
        code: "payroll_fiscal_window_unresolved",
        message:
          "Cannot resolve payroll fiscal window. Set tax-profile.fiscal_year.period_from/period_to " +
          "or company.yaml fiscal_year_end_month / tax-profile.fiscal_year.end_month, " +
          "or pass fiscalYear+fiscalYearEndMonth / periodFrom+periodTo.",
      },
    ];
  }
  return [];
}

/** Non-throwing resolve. */
export function tryResolvePayrollFiscalWindow(
  opts: PayrollFiscalWindowOpts = {},
): PayrollFiscalWindow | null {
  try {
    return resolvePayrollFiscalWindow(opts);
  } catch (e) {
    if (e instanceof PayrollFiscalWindowError) return null;
    throw e;
  }
}

/** Short alias (plan / docs). */
export const tryResolve = tryResolvePayrollFiscalWindow;

/**
 * Resolve inclusive payroll reconcile window.
 * Throws PayrollFiscalWindowError when resolution is ambiguous or conflicted.
 */
export function resolvePayrollFiscalWindow(
  opts: PayrollFiscalWindowOpts = {},
): PayrollFiscalWindow {
  if (opts.periodFrom || opts.periodTo) {
    if (!opts.periodFrom || !opts.periodTo) {
      throw new PayrollFiscalWindowError(
        "invalid_opts",
        "Both periodFrom and periodTo are required when overriding the fiscal window",
      );
    }
    const period_from = toYearMonth(opts.periodFrom);
    const period_to = toYearMonth(opts.periodTo);
    if (period_from > period_to) {
      throw new PayrollFiscalWindowError(
        "invalid_period",
        `periodFrom ${period_from} is after periodTo ${period_to}`,
      );
    }
    const endGuess = Number(period_to.slice(5, 7));
    const fiscal_year =
      opts.fiscalYear != null
        ? normalizeFiscalYearLabel(opts.fiscalYear)
        : inferFiscalYearLabel(period_from, endGuess);
    return {
      fiscal_year,
      period_from,
      period_to,
      source: "opts",
    };
  }

  if (opts.fiscalYear != null && opts.fiscalYearEndMonth != null) {
    const fiscal_year = normalizeFiscalYearLabel(opts.fiscalYear);
    const period = derivePeriodFromFiscalYear(fiscal_year, opts.fiscalYearEndMonth);
    return { fiscal_year, ...period, source: "opts" };
  }

  const tax = readTaxFiscalProfile(opts.tenantDir);
  const { resolved: endMonth } = resolveEndMonths(opts);

  if (tax?.period_from && tax.period_to && opts.fiscalYearEndMonth == null) {
    const period_from = toYearMonth(tax.period_from);
    const period_to = toYearMonth(tax.period_to);
    if (period_from > period_to) {
      throw new PayrollFiscalWindowError(
        "invalid_period",
        `tax-profile period_from ${period_from} is after period_to ${period_to}`,
      );
    }
    if (opts.fiscalYear != null && typeof endMonth === "number") {
      const fiscal_year = normalizeFiscalYearLabel(opts.fiscalYear);
      const derived = derivePeriodFromFiscalYear(fiscal_year, endMonth);
      if (
        derived.period_from !== period_from ||
        derived.period_to !== period_to
      ) {
        return { fiscal_year, ...derived, source: "company_fy" };
      }
      return {
        fiscal_year,
        period_from,
        period_to,
        source: "tax_period",
      };
    }
    const fiscal_year =
      opts.fiscalYear != null
        ? normalizeFiscalYearLabel(opts.fiscalYear)
        : endMonth != null
          ? inferFiscalYearLabel(period_from, endMonth)
          : inferFiscalYearLabel(period_from, Number(period_to.slice(5, 7)));
    return {
      fiscal_year,
      period_from,
      period_to,
      source: "tax_period",
    };
  }

  if (typeof endMonth !== "number") {
    throw new PayrollFiscalWindowError(
      "unresolved_end_month",
      "Cannot resolve fiscal year-end month. Set company.yaml fiscal_year_end_month or " +
        "tax-profile.fiscal_year.end_month (or period_from/period_to), " +
        "or pass fiscalYearEndMonth / periodFrom+periodTo.",
    );
  }

  const asOf = opts.asOfYm ?? currentUtcYm();
  const fiscal_year =
    opts.fiscalYear != null
      ? normalizeFiscalYearLabel(opts.fiscalYear)
      : inferFiscalYearLabel(asOf, endMonth);
  const period = derivePeriodFromFiscalYear(fiscal_year, endMonth);
  return { fiscal_year, ...period, source: "company_fy" };
}
