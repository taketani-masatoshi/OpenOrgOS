import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { syncSalesDemoDealOnConfirm } from "../src/lib/sales-demo-confirm.js";
import { findDeal } from "../src/lib/sales-deal-service.js";
import type { SchedulingCase } from "../schemas/executive/scheduling-cases.js";

function cleanup(): void {
  const sales = join(getDataDir(), "sales");
  if (existsSync(sales)) rmSync(sales, { recursive: true, force: true });
}

function seedDeal(): void {
  mkdirSync(join(getDataDir(), "sales"), { recursive: true });
  writeFileSync(
    join(getDataDir(), "sales", "pipeline.yaml"),
    YAML.stringify({
      version: 1,
      deals: [
        {
          id: "DEAL-2026-050",
          title: "Demo deal",
          stage: "qualify",
          owner_name: "op",
          counterparty: "Demo Co",
          amount_man: 100,
          next_action: "デモ調整中",
        },
      ],
    }),
    "utf-8",
  );
}

function baseCase(partial: Partial<SchedulingCase>): SchedulingCase {
  return {
    id: "SCH-2026-050",
    title: "Product demo",
    status: "confirmed",
    created_at: "2026-08-28T10:00:00+09:00",
    updated_at: "2026-08-28T12:00:00+09:00",
    participants: [
      { id: "PART-001", name: "Partner", role: "external", response: "accept" },
    ],
    proposed_slots: [],
    duration_minutes: 60,
    mail_thread_ids: [],
    processed_mail_ids: [],
    calendar_sync: "not_requested",
    meeting_format: "online",
    venue_options: [],
    ceo_intake_confirmed: true,
    agent_assist_needed: false,
    counter_round: 0,
    proposal_revision: 0,
    reminder_targets: [],
    reminder_history: [],
    correspondence: [],
    lifecycle_events: [],
    revision: 1,
    source: "cli",
    next_action: "none",
    kind: "sales_demo",
    deal_id: "DEAL-2026-050",
    ...partial,
  };
}

describe("sales demo confirm hook", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seedDeal();
  });

  afterEach(() => cleanup());

  it("updates deal next_action and scheduling_case_id on sales_demo confirmed", () => {
    syncSalesDemoDealOnConfirm(baseCase({}));
    const deal = findDeal("DEAL-2026-050");
    expect(deal?.scheduling_case_id).toBe("SCH-2026-050");
    expect(deal?.next_action).toBe("デモ実施 · フォローアップ");
    expect(deal?.next_action_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignores non-sales_demo kinds", () => {
    syncSalesDemoDealOnConfirm(baseCase({ kind: "general" }));
    const deal = findDeal("DEAL-2026-050");
    expect(deal?.next_action).toBe("デモ調整中");
    expect(deal?.scheduling_case_id).toBeUndefined();
  });

  it("ignores missing deal_id", () => {
    syncSalesDemoDealOnConfirm(baseCase({ deal_id: undefined }));
    expect(findDeal("DEAL-2026-050")?.next_action).toBe("デモ調整中");
  });
});
