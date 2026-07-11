import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ArApEntry,
  ArApLedgerFile,
} from "../../../../../../schemas/jp-bank-corporate.js";
import type { ChartOfAccounts } from "../../../../../../schemas/finance/types.js";
import { loadChartOfAccounts, loadProperties } from "../../../../../../src/lib/data.js";
import { billingMonthEndDate, invoiceNumber, paymentDueDate } from "../../../../../../src/lib/invoice-dates.js";
import { loadModulesFile } from "../../../../../../src/lib/modules.js";
import { resolveTenantPath } from "../../../../../../src/lib/utils.js";
import { resolveDefaultAccountId } from "./calendar-import.js";
import { resolveChartAccountId } from "./chart-account.js";

export interface InvoiceArApSyncOptions {
  fy?: string;
  month?: string;
}

export interface InvoiceArApSyncResult {
  entries: ArApEntry[];
  warnings: string[];
}

function normalizeFy(fy: string): string {
  const match = fy.match(/^(?:FY)?(\d{4})$/i);
  if (!match) throw new Error(`Invalid fiscal year "${fy}" — use FY2026`);
  return `FY${match[1]}`;
}

export function findGeneratedInvoiceMonths(
  root: string,
  options: InvoiceArApSyncOptions
): Array<{ fiscalYear: string; month: string }> {
  if (!existsSync(root)) return [];
  const requestedFy = options.fy ? normalizeFy(options.fy) : undefined;
  const seen = new Set<string>();
  const result: Array<{ fiscalYear: string; month: string }> = [];

  for (const fyDir of readdirSync(root, { withFileTypes: true })) {
    if (!fyDir.isDirectory() || !/^FY\d{4}$/i.test(fyDir.name)) continue;
    const fiscalYear = fyDir.name.toUpperCase();
    if (requestedFy && requestedFy !== fiscalYear) continue;
    const outputDir = join(root, fyDir.name, "output");
    if (!existsSync(outputDir)) continue;
    for (const file of readdirSync(outputDir)) {
      const month = file.match(/^(\d{4}-\d{2})-invoice\.(?:pdf|eml|msg)$/)?.[1];
      if (!month || (options.month && options.month !== month)) continue;
      const key = `${fiscalYear}|${month}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ fiscalYear, month });
    }
  }
  return result.sort(
    (a, b) => a.month.localeCompare(b.month) || a.fiscalYear.localeCompare(b.fiscalYear)
  );
}

export function buildInvoiceArApEntries(
  options: InvoiceArApSyncOptions = {},
  dependencies: {
    modules?: ReturnType<typeof loadModulesFile>["modules"];
    properties?: ReturnType<typeof loadProperties>;
    accountId?: string;
    chartOfAccounts?: ChartOfAccounts;
    resolveInvoiceMonths?: typeof findGeneratedInvoiceMonths;
  } = {}
): InvoiceArApSyncResult {
  const warnings: string[] = [];
  const entries: ArApEntry[] = [];
  const properties = new Map(
    (dependencies.properties ?? loadProperties()).map((property) => [property.id, property])
  );
  const accountId = dependencies.accountId ?? resolveDefaultAccountId();
  const resolveInvoiceMonths =
    dependencies.resolveInvoiceMonths ?? findGeneratedInvoiceMonths;
  let chart = dependencies.chartOfAccounts;
  if (!chart) {
    try {
      chart = loadChartOfAccounts();
    } catch (error) {
      warnings.push(
        `chart of accounts is not available: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  for (const module of dependencies.modules ?? loadModulesFile().modules) {
    if (!module.enabled) continue;
    for (const [propertyId, billing] of Object.entries(module.billing ?? {})) {
      const property = properties.get(propertyId);
      const amount = property?.rental?.monthly_rent;
      if (!property || !amount) {
        warnings.push(
          `${module.id}/${propertyId}: invoice amount is not available; no AR/AP entry imported`
        );
        continue;
      }
      const invoices = resolveInvoiceMonths(resolveTenantPath(billing.docs_base), options);
      if (invoices.length === 0) {
        warnings.push(`${module.id}/${propertyId}: no generated invoice artifacts found`);
      }
      for (const invoice of invoices) {
        const invoiceId = invoiceNumber(invoice.month, billing.invoice_number_prefix);
        entries.push({
          id: `AR-${invoiceId}`,
          kind: "ar",
          amount,
          category: "rent",
          booked_date: billingMonthEndDate(invoice.month),
          due_date: paymentDueDate(invoice.month),
          counterparty: billing.tenant_name ?? `${property.name} 賃借人`,
          description: `${property.name} ${invoice.month} 請求`,
          account_id: accountId,
          invoice_id: invoiceId,
          collection_term_id: "term-ar-rent",
          due_date_source: "invoice-payment-due-date",
          origin_source: "invoice",
          origin_id: `${module.id}:${propertyId}:${invoice.fiscalYear}:${invoice.month}`,
          status: "open",
          source: "import",
        });
      }
    }
  }

  for (const entry of entries) {
    if (!chart) continue;
    const resolved = resolveChartAccountId(
      {
        category: entry.category ?? entry.description,
        direction: entry.kind === "ar" ? "inflow" : "outflow",
        chart_account_id: entry.chart_account_id,
      },
      chart
    );
    entry.chart_account_id = resolved.chart_account_id;
    if (resolved.warning) warnings.push(`${entry.id}: ${resolved.warning}`);
  }

  return {
    entries: entries.sort(
      (a, b) => a.booked_date.localeCompare(b.booked_date) || a.id.localeCompare(b.id)
    ),
    warnings,
  };
}

export function mergeArApEntries(
  ledger: ArApLedgerFile,
  incoming: ArApEntry[]
): { ledger: ArApLedgerFile; added: number } {
  const ids = new Set(ledger.entries.map((entry) => entry.id));
  const additions = incoming.filter((entry) => {
    if (ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  });
  return {
    ledger: {
      ...ledger,
      entries: [...ledger.entries, ...additions].sort(
        (a, b) => a.booked_date.localeCompare(b.booked_date) || a.id.localeCompare(b.id)
      ),
    },
    added: additions.length,
  };
}
