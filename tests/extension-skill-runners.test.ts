import { describe, expect, it } from "vitest";
import {
  formatGovernanceMeetingsMarkdown,
  formatGovernanceRegisterMarkdown,
  formatProcurementOrdersMarkdown,
  formatProcurementVendorsMarkdown,
  formatRiskInsuranceMarkdown,
  formatRiskRegisterMarkdown,
} from "../src/lib/extension-sot.js";

describe("extension SoT summaries", () => {
  it("counts procurement orders by status including pending approval", () => {
    const md = formatProcurementOrdersMarkdown({
      as_of: "2026-08-24",
      orders: [
        { id: "PO-1", status: "pending_approval", amount_yen: 1000 },
        { id: "PO-2", status: "approved", amount_yen: 2000 },
      ],
    });
    expect(md).toContain("発注数: 2 · 承認待ち: 1");
    expect(md).toContain("- pending_approval: 1");
  });

  it("counts vendors by status", () => {
    const md = formatProcurementVendorsMarkdown({
      vendors: [
        { id: "V-1", name: "A", status: "active" },
        { id: "V-2", name: "B", status: "active" },
      ],
    });
    expect(md).toContain("ベンダー数: 2");
    expect(md).toContain("- active: 2");
  });

  it("splits governance meetings into upcoming vs past", () => {
    const md = formatGovernanceMeetingsMarkdown(
      {
        meetings: [
          { id: "BOD-1", kind: "board", scheduled_on: "2026-08-20", status: "held" },
          { id: "BOD-2", kind: "board", scheduled_on: "2026-08-28", status: "scheduled" },
        ],
      },
      "2026-08-24"
    );
    expect(md).toContain("会議数: 2 · 本日以降: 1");
    expect(md).toContain("- board: 2");
  });

  it("counts governance register items", () => {
    const md = formatGovernanceRegisterMarkdown({
      items: [{ id: "GOV-1", title: "定款", status: "current" }],
    });
    expect(md).toContain("台帳項目: 1");
    expect(md).toContain("- current: 1");
  });

  it("counts open risks", () => {
    const md = formatRiskRegisterMarkdown({
      risks: [
        { id: "R-1", title: "a", severity: "high", status: "open" },
        { id: "R-2", title: "b", severity: "low", status: "closed" },
      ],
    });
    expect(md).toContain("リスク数: 2 · 未クローズ: 1");
    expect(md).toContain("- high: 1");
  });

  it("flags insurance renewals inside 90 days", () => {
    const md = formatRiskInsuranceMarkdown(
      {
        policies: [
          { id: "INS-1", name: "火災", renews_on: "2026-09-15", status: "active" },
          { id: "INS-2", name: "賠償", renews_on: "2027-01-01", status: "active" },
        ],
      },
      "2026-08-24"
    );
    expect(md).toContain("証券数: 2 · 90日以内更新: 1");
  });
});
