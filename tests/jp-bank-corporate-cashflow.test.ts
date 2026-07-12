// @catalog-coverage: full
// @catalog-ids: jp_bank_corporate
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadModuleManifest } from "../src/lib/modules.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import {
  buildCashflowSchedule,
  CashflowScheduleBuilder,
  formatCashflowMarkdown,
  parseHorizonEnd,
  resolveCashflowLineItems,
  resolveRawLineChartAccounts,
  rollupCashflowRows,
  type RawLineItem,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/cashflow-builder.js";
import {
  escapeCsvValue,
  generateCashflowExport,
  renderTemplateCsv,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/cashflow-export.js";
import { resolveChartAccountId } from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/chart-account.js";
import { loadCashflowExportTemplate } from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/data-loaders.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import {
  cashflowExportTemplateSchema,
  type CashflowScheduleRow,
} from "../schemas/jp-bank-corporate.js";
import {
  runJpBankCalendarValidate,
  runJpBankCashflowGenerate,
  runJpBankPositionShow,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";
import { loadPaymentCalendar } from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/data-loaders.js";
import {
  cleanupJpBankCorporateTenant,
  seedJpBankCorporateTenant,
} from "./helpers/jp-bank-corporate-fixture.js";

describe("jp_bank_corporate cashflow", () => {
  const tenantId = `test-jp-bank-cashflow-${process.pid}`;
  beforeEach(() => {
    seedJpBankCorporateTenant(tenantId);
  });
  afterEach(() => cleanupJpBankCorporateTenant(tenantId));

  it("has manifest and CLI bundle", () => {
    const manifest = loadModuleManifest("jp_bank_corporate");
    expect(manifest?.id).toBe("jp_bank_corporate");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("jp_bank_corporate");
  });

  it("loads payment calendar from tenant finance", () => {
    const cal = loadPaymentCalendar();
    expect(cal?.data.entries.length).toBeGreaterThan(0);
    expect(cal?.path).toContain(`${tenantId}/data/finance/payment-calendar.yaml`);
  });

  it("parses horizon strings", () => {
    expect(parseHorizonEnd("2026-07-01", "13w")).toBe("2026-09-30");
    expect(parseHorizonEnd("2026-07-01", "90d")).toBe("2026-09-29");
  });

  it("builds cashflow schedule with opening balance and rows", () => {
    const schedule = buildCashflowSchedule({
      granularity: "weekly",
      horizonStart: "2026-07-01",
      horizon: "4w",
    });
    expect(schedule.opening_balance_total).toBe(10100);
    expect(schedule.opening_balance_by_account["BANK-901"]).toBe(10100);
    expect(schedule.rows.length).toBeGreaterThan(0);
    expect(schedule.granularity).toBe("weekly");
    expect(schedule.horizon_start).toBe("2026-07-01");
  });

  it("resolves fixture COA codes without confusing BANK ids", () => {
    const chart = loadChartOfAccounts();
    expect(
      resolveChartAccountId(
        { category: "communication", direction: "outflow" },
        chart
      )
    ).toEqual({ chart_account_id: "5700" });
    expect(
      resolveChartAccountId(
        {
          category: "unmapped",
          direction: "outflow",
          chart_account_id: "5300",
        },
        chart
      )
    ).toEqual({ chart_account_id: "5300" });
    expect(
      resolveChartAccountId(
        { category: "BANK-001", direction: "outflow" },
        chart
      )
    ).toEqual({
      warning: "BANK-001: chart account could not be resolved",
    });
    const resolved = resolveRawLineChartAccounts(
      [
        {
          line_id: "COA-FIXTURE",
          date: "2026-07-01",
          direction: "outflow",
          category: "通信費",
          description: "fixture",
          amount: 1,
          source: "planned",
          planned_amount: 1,
          actual_amount: null,
          forecast_amount: null,
        },
      ],
      chart
    );
    expect(resolved.items[0].chart_account_id).toBe("5700");
    expect(resolved.warnings).toEqual([]);
  });

  it("resolves payroll and fixed-cost auto rows from tenant COA metadata", () => {
    const chart = loadChartOfAccounts();
    const rawItems = new CashflowScheduleBuilder({
      granularity: "daily",
      horizonStart: "2026-08-01",
      horizonEnd: "2026-09-30",
    }).buildRawLineItems();
    const autoItems = rawItems.filter((item) =>
      ["payroll-auto", "fixed-cost-auto"].includes(item.origin ?? "")
    );
    const resolved = resolveRawLineChartAccounts(autoItems, chart);
    const payrollAccount = chart.accounts.find((account) =>
      account.data_source?.endsWith("/payroll.yaml")
    );
    const payrollRows = resolved.items.filter((item) => item.origin === "payroll-auto");
    const fixedCostRows = resolved.items.filter((item) => item.origin === "fixed-cost-auto");

    expect(payrollAccount).toBeDefined();
    expect(payrollRows.length).toBeGreaterThan(0);
    expect(payrollRows.every((item) => item.chart_account_id === payrollAccount?.code)).toBe(true);
    expect(fixedCostRows.length).toBeGreaterThan(0);
    expect(fixedCostRows.every((item) => item.category === "通信費")).toBe(true);
    expect(fixedCostRows.every((item) => item.chart_account_id != null)).toBe(true);
    expect(resolved.warnings).toEqual([]);
  });

  it("builds the fixture 13-week schedule without chart warnings", () => {
    const schedule = buildCashflowSchedule({
      granularity: "weekly",
      horizonStart: "2026-07-13",
      horizon: "13w",
    });

    expect(schedule.warnings).toEqual([]);
  });

  it("loads validated templates and escapes every CSV field", () => {
    const loaded = loadCashflowExportTemplate("cash-book-csv");
    expect(loaded.data.columns.map((column) => column.header)).toContain("摘要");
    expect(() =>
      cashflowExportTemplateSchema.parse({
        id: "invalid",
        label: "invalid",
        columns: [{ key: "account_number", header: "口座番号" }],
      })
    ).toThrow();
    expect(escapeCsvValue('a,"b"\nline')).toBe('"a,""b""\nline"');
    expect(
      renderTemplateCsv(loaded.data, [
        {
          period_key: "2026-07-01",
          category: "通信,費",
          description: '回線 "A"',
          planned_amount: 100,
          balance_total: 900,
          account_id: "BANK-001",
          direction: "outflow",
        },
      ])
    ).toContain('"通信,費","回線 ""A"""');
  });

  it("exports weekly bank aggregates and only known tax amounts", () => {
    const weekly = generateCashflowExport("mizuho-weekly");
    expect(weekly.row_count).toBeGreaterThan(0);
    expect(weekly.csv).toContain("週開始日,週終了日,口座ID");
    expect(weekly.csv).not.toMatch(/口座番号|account_number/);

    const tax = generateCashflowExport("tax-payment-csv");
    expect(tax.row_count).toBe(0);
    expect(tax.csv).not.toContain("消費税");
    expect(tax.csv).not.toContain("法人住民税");
    expect(tax.csv).not.toMatch(/口座番号|account_number/);
  });

  it("resolves source priority and known generated duplicates without merging valid peers", () => {
    const line = (
      overrides: Partial<RawLineItem> & Pick<RawLineItem, "line_id">
    ): RawLineItem => ({
      date: "2026-07-25",
      direction: "outflow",
      category: "給与",
      description: "7月給与",
      amount: 320000,
      account_id: "BANK-001",
      source: "planned",
      planned_amount: 320000,
      actual_amount: null,
      forecast_amount: null,
      ...overrides,
    });
    const resolved = resolveCashflowLineItems([
      line({
        line_id: "payroll-2026-07",
        date: "2026-07-24",
        amount: 160000,
        planned_amount: 160000,
        origin: "payroll-auto",
      }),
      line({
        line_id: "PAY-A",
        description: "A社 7月給与",
        source: "payment-calendar",
        origin: "payment-calendar",
      }),
      line({
        line_id: "PAY-B",
        description: "B社 7月給与",
        source: "payment-calendar",
        origin: "payment-calendar",
      }),
      line({
        line_id: "ARAP-DUPLICATE",
        description: "A社 7月給与",
        source: "ar-ap",
        origin: "ar-ap",
      }),
      line({
        line_id: "tax-hojinzei",
        date: "2027-03-30",
        category: "税金",
        description: "法人税",
        amount: 775000,
        planned_amount: 775000,
        source: "tax-calendar",
        origin: "tax-auto",
      }),
      line({
        line_id: "TAX-CANONICAL",
        date: "2027-03-31",
        category: "法人税",
        description: "第9期 法人税納付",
        amount: 775000,
        planned_amount: 775000,
        source: "tax-calendar",
        origin: "payment-calendar",
      }),
      line({
        line_id: "capex-2026-08",
        date: "2026-08-25",
        category: "設備投資",
        description: "設備投資（予実）",
        amount: 500000,
        planned_amount: 500000,
        origin: "capex-auto",
      }),
      line({
        line_id: "CAPEX-CANONICAL",
        date: "2026-08-20",
        category: "設備投資",
        description: "設備取得",
        amount: 500000,
        planned_amount: 500000,
        source: "payment-calendar",
        origin: "payment-calendar",
      }),
      line({
        line_id: "fixed-通信費-2026-09",
        date: "2026-09-28",
        category: "固定費",
        description: "通信費",
        amount: 3000,
        planned_amount: 3000,
        origin: "fixed-cost-auto",
      }),
      line({
        line_id: "COMM-CANONICAL",
        date: "2026-09-27",
        category: "通信費",
        description: "通信費",
        amount: 3000,
        planned_amount: 3000,
        source: "payment-calendar",
        origin: "payment-calendar",
      }),
      line({
        line_id: "forecast-2026-07",
        date: "2026-07-31",
        direction: "inflow",
        category: "月次予測CF",
        description: "2026-07 純キャッシュフロー",
        amount: 999999,
        planned_amount: 999999,
        forecast_amount: 999999,
        source: "forecast",
        origin: "monthly-forecast",
      }),
      line({
        line_id: "forecast-2026-10",
        date: "2026-10-31",
        direction: "inflow",
        category: "月次予測CF",
        description: "2026-10 純キャッシュフロー",
        amount: 123456,
        planned_amount: 123456,
        forecast_amount: 123456,
        source: "forecast",
        origin: "monthly-forecast",
      }),
    ]);

    expect(resolved.map((item) => item.line_id)).toEqual([
      "PAY-A",
      "PAY-B",
      "CAPEX-CANONICAL",
      "COMM-CANONICAL",
      "forecast-2026-10",
      "TAX-CANONICAL",
    ]);
    expect(
      resolved.reduce(
        (total, item) =>
          total + (item.direction === "inflow" ? item.amount : -item.amount),
        0
      )
    ).toBe(-1794544);
  });

  it("rolls weekly rows up by period and direction with exact amounts and balances", () => {
    const row = (
      overrides: Partial<CashflowScheduleRow>
    ): CashflowScheduleRow => ({
      period_key: "2026-07-06",
      period_start: "2026-07-06",
      period_end: "2026-07-06",
      direction: "inflow",
      category: "売掛回収",
      description: "明細",
      planned_amount: 0,
      actual_amount: null,
      forecast_amount: null,
      balance_total: 1000,
      balance_by_account: { "BANK-001": 1000 },
      source: "ar-ap",
      ...overrides,
    });
    const rolled = rollupCashflowRows(
      [
        row({ planned_amount: 100, balance_total: 1100 }),
        row({
          period_key: "2026-07-07",
          period_start: "2026-07-07",
          period_end: "2026-07-07",
          direction: "outflow",
          planned_amount: 0,
          actual_amount: 40,
          balance_total: 1060,
          balance_by_account: { "BANK-001": 1060 },
        }),
        row({
          period_key: "2026-07-08",
          period_start: "2026-07-08",
          period_end: "2026-07-08",
          direction: "transfer",
          planned_amount: 500,
          balance_total: 1060,
          balance_by_account: { "BANK-001": 560, "BANK-002": 500 },
        }),
        row({
          period_key: "2026-07-13",
          period_start: "2026-07-13",
          period_end: "2026-07-13",
          direction: "outflow",
          forecast_amount: 25,
          balance_total: 1035,
          balance_by_account: { "BANK-001": 535, "BANK-002": 500 },
        }),
      ],
      "weekly"
    );

    expect(rolled).toHaveLength(4);
    expect(rolled[0]).toMatchObject({
      period_key: "2026-W28",
      direction: "inflow",
      planned_amount: 100,
      actual_amount: null,
      forecast_amount: null,
      balance_total: 1060,
      detail_count: 1,
    });
    expect(rolled[1]).toMatchObject({
      direction: "outflow",
      planned_amount: 0,
      actual_amount: 40,
      balance_total: 1060,
    });
    expect(rolled[2]).toMatchObject({
      direction: "transfer",
      planned_amount: 500,
      balance_total: 1060,
      balance_by_account: { "BANK-001": 560, "BANK-002": 500 },
    });
    expect(rolled[3]).toMatchObject({
      period_key: "2026-W29",
      direction: "outflow",
      forecast_amount: 25,
      balance_total: 1035,
    });
  });

  it("keeps closing total unchanged when transfer rows are rolled up", () => {
    const transfer: RawLineItem = {
      line_id: "XFER-TEST",
      date: "2026-07-15",
      direction: "transfer",
      category: "口座振替",
      description: "内部振替",
      amount: 1000000,
      account_id: "BANK-002",
      counterparty_account_id: "BANK-001",
      source: "payment-calendar",
      planned_amount: 1000000,
      actual_amount: null,
      forecast_amount: null,
      origin: "payment-calendar",
    };
    const daily = new CashflowScheduleBuilder({
      granularity: "daily",
      horizonStart: "2026-07-01",
      horizonEnd: "2026-07-31",
    }).computeSchedule([transfer]);
    const weekly = new CashflowScheduleBuilder({
      granularity: "weekly",
      horizonStart: "2026-07-01",
      horizonEnd: "2026-07-31",
    }).computeSchedule([transfer]);

    expect(daily.closing_balance_total).toBe(10100);
    expect(weekly.closing_balance_total).toBe(daily.closing_balance_total);
    expect(
      Object.values(weekly.closing_balance_by_account).reduce(
        (sum, amount) => sum + amount,
        0
      )
    ).toBe(10100);
    expect(weekly.rows[0]).toMatchObject({
      direction: "transfer",
      planned_amount: 1000000,
      balance_total: 10100,
    });
  });

  it("detects shortfall when horizon includes large capex outflows", () => {
    const builder = new CashflowScheduleBuilder({
      granularity: "daily",
      horizonStart: "2026-03-01",
      horizonEnd: "2026-04-30",
    });
    const schedule = builder.computeSchedule([
      {
        line_id: "CAPEX-FIXTURE",
        date: "2026-03-20",
        direction: "outflow",
        category: "設備投資",
        description: "Fixture capex",
        amount: 11000,
        source: "planned",
        planned_amount: 11000,
        actual_amount: null,
        forecast_amount: null,
      },
    ]);
    expect(schedule.rows.some((r) => r.category === "設備投資")).toBe(true);
    expect(schedule.shortfall_date).toBe("2026-03-20");
  });

  it("distinguishes first shortfall from deepest required funding", () => {
    const schedule = new CashflowScheduleBuilder({
      granularity: "daily",
      horizonStart: "2026-07-01",
      horizonEnd: "2026-07-31",
    }).computeSchedule([
      {
        line_id: "FIRST",
        date: "2026-07-10",
        direction: "outflow",
        category: "fixture",
        description: "first shortfall",
        amount: 11100,
        source: "planned",
        planned_amount: 11100,
        actual_amount: null,
        forecast_amount: null,
      },
      {
        line_id: "RECOVER",
        date: "2026-07-15",
        direction: "inflow",
        category: "fixture",
        description: "partial recovery",
        amount: 500,
        source: "planned",
        planned_amount: 500,
        actual_amount: null,
        forecast_amount: null,
      },
      {
        line_id: "DEEPEST",
        date: "2026-07-20",
        direction: "outflow",
        category: "fixture",
        description: "deepest shortfall",
        amount: 2000,
        source: "planned",
        planned_amount: 2000,
        actual_amount: null,
        forecast_amount: null,
      },
    ]);
    expect(schedule.shortfall_amount).toBe(-1000);
    expect(schedule.shortfall_date).toBe("2026-07-10");
    expect(schedule.required_funding_amount).toBe(2500);
    expect(schedule.required_funding_by_date).toBe("2026-07-20");
    expect(formatCashflowMarkdown(schedule)).toContain("必要調達額: ￥2,500");
  });

  it("formats markdown report", () => {
    const schedule = buildCashflowSchedule({
      granularity: "monthly",
      horizonStart: "2026-07-01",
      horizon: "2m",
    });
    const md = formatCashflowMarkdown(schedule);
    expect(md).toContain("資金繰り表");
    expect(md).toContain("期首残高");
  });

  it("validates payment calendar", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpBankCalendarValidate();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("payment-calendar"));
    spy.mockRestore();
  });

  it("shows cash position", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpBankPositionShow({});
    expect(spy.mock.calls.some((c) => String(c[0]).includes("キャッシュポジション"))).toBe(true);
    spy.mockRestore();
  });

  it("generates cashflow to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpBankCashflowGenerate({ granularity: "weekly", horizon: "4w", format: "md" });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("資金繰り表"))).toBe(true);
    spy.mockRestore();
  });

  it("includes bank statement actuals and detail rows in fixture schedule", () => {
    const schedule = buildCashflowSchedule({
      granularity: "weekly",
      horizonStart: "2026-07-01",
      horizon: "13w",
    });
    const actualSources = (schedule.detail_rows ?? []).map((row) => row.source);
    expect(actualSources).toContain("import");
    expect(schedule.rows.some((row) => row.detail_count && row.detail_count > 0)).toBe(true);
  });

  it("parses bank statement CSV fixtures", async () => {
    const { parseBankStatementCsv } = await import(
      "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/bank-statement-import.js"
    );
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const csv = readFileSync(
      join(
        process.cwd(),
        "steward/jurisdiction-packs/JP/modules/jp_bank_corporate/seed/bank-statement.csv.example"
      ),
      "utf-8"
    );
    const rows = parseBankStatementCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.direction).toBe("inflow");
  });
});
