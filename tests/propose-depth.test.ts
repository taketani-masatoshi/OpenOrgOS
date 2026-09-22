/**
 * Propose depth / SoT wiring.
 * Path: tests/propose-depth.test.ts
 */
import { describe, expect, it } from "vitest";
import type { SalesDeal } from "../schemas/sales.js";
import {
  dueItemsFromDeals,
  renderAiaCycleReport,
  renderCashflowReport,
  renderDispatchReport,
  renderFollowupReport,
  renderLostDealFollowupReport,
  renderPayrollTransferReport,
  renderProjectPlReport,
  renderSodReport,
  renderStockReorderReport,
  scanSilentDeals,
  renderBottleneckReport,
} from "../src/lib/propose-surface.js";

const deal = (partial: Partial<SalesDeal> & Pick<SalesDeal, "id" | "stage">): SalesDeal =>
  ({
    title: partial.id,
    ...partial,
  }) as SalesDeal;

describe("propose depth / SoT", () => {
  it("lost-deal pipeline scan yields L2 and candidates", () => {
    const empty = renderLostDealFollowupReport({
      deals: [],
      asOf: "2026-09-21",
      silentDaysThreshold: 7,
    });
    expect(empty.candidates).toEqual([]);
    expect(empty.dealId).toBe("");
    expect(empty.depth).toBe("L0");

    const deals = [
      deal({
        id: "DEAL-2026-001",
        stage: "proposal",
        stage_entered_on: "2026-08-01",
      }),
      deal({
        id: "DEAL-2026-002",
        stage: "proposal",
        stage_entered_on: "2026-09-20",
      }),
    ];
    expect(scanSilentDeals(deals, "2026-09-21", 14).map((row) => row.dealId)).toEqual([
      "DEAL-2026-001",
    ]);
    const report = renderLostDealFollowupReport({
      deals,
      asOf: "2026-09-21",
      silentDaysThreshold: 14,
    });
    expect(report.depth).toBe("L2");
    expect(report.candidates[0]?.dealId).toBe("DEAL-2026-001");
    expect(report.sent).toBe(false);
  });

  it("followup from next_action_due maps deals and stays unsent", () => {
    const items = dueItemsFromDeals([
      deal({ id: "DEAL-2026-003", stage: "qualify", next_action_due: "2026-09-22" }),
      deal({ id: "DEAL-2026-004", stage: "qualify" }),
    ]);
    expect(items).toEqual([{ id: "DEAL-2026-003", dueOn: "2026-09-22", kind: "sales_deal" }]);
    const report = renderFollowupReport(items, "2026-09-21", 7);
    expect(report.depth).toBe("L1");
    expect(report.drafts).toHaveLength(1);
    expect(report.sent).toBe(false);
  });

  it("cashflow / payroll / P/L / stock with hand inputs are L1 and non-empty when data present", () => {
    const cashEmpty = renderCashflowReport({
      openingYen: 0,
      from: "2026-09-21",
      to: "2026-09-21",
      flows: [],
    });
    expect(cashEmpty.depth).toBe("L1");
    expect(cashEmpty.series).toEqual([{ date: "2026-09-21", balanceYen: 0 }]);

    const cash = renderCashflowReport({
      openingYen: 100,
      from: "2026-09-21",
      to: "2026-09-22",
      flows: [{ date: "2026-09-22", yen: -10 }],
    });
    expect(cash.series[1]?.balanceYen).toBe(90);

    const payroll = renderPayrollTransferReport({ payrollRunId: "RUN-1", totalYen: 50_000 });
    expect(payroll.depth).toBe("L0");
    expect(payroll.executed).toBe(false);
    expect(payroll.amountYen).toBe(50_000);

    const plEmpty = renderProjectPlReport([]);
    expect(plEmpty.rows).toEqual([]);
    const pl = renderProjectPlReport([
      {
        lines: [
          { account_code: "4000", debit_yen: 0, credit_yen: 100, project_code: "P1" },
        ],
      },
    ]);
    expect(pl.depth).toBe("L1");
    expect(pl.rows).toEqual([{ project_code: "P1", net_yen: 100 }]);

    const stockEmpty = renderStockReorderReport([]);
    expect(stockEmpty.proposals).toEqual([]);
    const stock = renderStockReorderReport([{ id: "SKU-1", stock_qty: 0, threshold: 2 }]);
    expect(stock.depth).toBe("L1");
    expect(stock.proposals[0]?.sku).toBe("SKU-1");
    expect(stock.sent).toBe(false);
  });

  it("dispatch prefers lower load when waypoint scores tie", () => {
    const report = renderDispatchReport(
      [{ id: "JOB-1", skill: "electric", waypoint: "site-a" }],
      [
        { id: "ST-BUSY", skills: ["electric"], free: true, waypoint: "site-a", load: 4 },
        { id: "ST-FREE", skills: ["electric"], free: true, waypoint: "site-a", load: 0 },
      ],
    );
    expect(report.depth).toBe("L1");
    expect(report.assignments[0]?.staffId).toBe("ST-FREE");
    expect(report.gpsTrace).toBe(false);
  });

  it("aia cycle from real scans without ledger refs is L1 and does not execute", () => {
    const report = renderAiaCycleReport({
      dueItems: [{ id: "A", dueOn: "2026-09-22", kind: "invoice" }],
      stuckItems: [{ id: "B", ownerId: "OP-1", waitingSince: "2026-09-01", kind: "job" }],
      jobs: [{ id: "JOB-1", skill: "electric" }],
      staff: [{ id: "ST-1", skills: ["electric"], free: true }],
      asOf: "2026-09-21",
      withinDays: 7,
      stuckDays: 3,
    });
    expect(report.depth).toBe("L1");
    expect(report.executed).toBe(false);
    expect(report.looping).toBe(false);
    expect(report.proposals.map((p: { id: string }) => p.id)).toEqual(["A", "B", "JOB-1"]);
  });

  it("sod report keeps human gate and never names a substitute", () => {
    const report = renderSodReport([
      { action: "request", actorId: "OP-1", subjectId: "APR-1" },
      { action: "approve", actorId: "OP-1", subjectId: "APR-1" },
    ]);
    expect(report.depth).toBe("L1");
    expect(report.ok).toBe(false);
    expect(report.substitute).toBeNull();
    expect(report.human_gate).toMatchObject({ apply: "human" });
  });

  it("bottleneck hand items stay L1 and unsent", () => {
    const report = renderBottleneckReport(
      [{ id: "J1", ownerId: "OP-1", waitingSince: "2026-09-01", kind: "job" }],
      "2026-09-21",
      3,
    );
    expect(report.depth).toBe("L1");
    expect(report.notified).toBe(false);
    expect(report.inputs_ref).toEqual([]);
  });
});
