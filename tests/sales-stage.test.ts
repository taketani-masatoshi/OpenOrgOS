import { describe, expect, it } from "vitest";
import { applyStageTransition, canTransitionStage } from "../src/lib/sales-stage.js";
import type { SalesDeal } from "../schemas/sales.js";

const baseDeal: SalesDeal = {
  id: "DEAL-2026-001",
  title: "Test",
  stage: "lead",
  owner_name: "Tester",
  counterparty: "Acme",
  amount_man: 100,
};

describe("sales-stage", () => {
  it("allows forward open transitions", () => {
    expect(canTransitionStage("lead", "qualify")).toBe(true);
    expect(canTransitionStage("lead", "negotiation")).toBe(true);
  });

  it("blocks backward open without reopen", () => {
    expect(canTransitionStage("negotiation", "lead")).toBe(false);
  });

  it("requires lost_reason for lost", () => {
    expect(() =>
      applyStageTransition({ deal: baseDeal, toStage: "lost", asOf: "2026-08-01" }),
    ).toThrow(/lost_reason/);
  });

  it("applies lost with reason", () => {
    const { deal } = applyStageTransition({
      deal: baseDeal,
      toStage: "lost",
      lostReason: "price",
      asOf: "2026-08-01",
    });
    expect(deal.stage).toBe("lost");
    expect(deal.lost_reason).toBe("price");
  });

  it("requires amount_man for won", () => {
    const noAmount = { ...baseDeal, amount_man: undefined };
    expect(() =>
      applyStageTransition({ deal: noAmount, toStage: "won", asOf: "2026-08-01" }),
    ).toThrow(/amount_man/);
  });

  it("allows reopen from lost to open stage", () => {
    const lost: SalesDeal = {
      ...baseDeal,
      stage: "lost",
      lost_reason: "timing",
    };
    expect(canTransitionStage("lost", "qualify")).toBe(false);
    expect(canTransitionStage("lost", "qualify", { reopen: true })).toBe(true);
    const { deal } = applyStageTransition({
      deal: lost,
      toStage: "qualify",
      reopen: true,
      asOf: "2026-08-10",
    });
    expect(deal.stage).toBe("qualify");
  });
});
