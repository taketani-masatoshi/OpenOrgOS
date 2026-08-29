import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  formatSecretaryConsultCeoReply,
  isOwnerDeskAgent,
  secretaryMayDispatchTo,
  stewardMayMutateCompanyData,
} from "../src/lib/agent-owner-desks.js";
import { handleStewardOrchestrateChatMessage } from "../src/lib/steward-chat/steward-orchestrate-intent.js";
import { runEscalation } from "../src/lib/escalate.js";
import { handleTenantConfigProposeChatMessage } from "../src/lib/steward-chat/tenant-config-intent.js";

describe("owner desks and secretary mandate", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("treats steward and secretary as owner desks", () => {
    expect(isOwnerDeskAgent("executive_steward")).toBe(true);
    expect(isOwnerDeskAgent("secretary")).toBe(true);
    expect(isOwnerDeskAgent("finance")).toBe(false);
    expect(secretaryMayDispatchTo("executive_steward")).toBe(true);
    expect(secretaryMayDispatchTo("finance")).toBe(false);
    expect(stewardMayMutateCompanyData("executive_steward")).toBe(true);
    expect(stewardMayMutateCompanyData("secretary")).toBe(false);
  });

  it("secretary orchestration consults steward only", () => {
    const result = handleStewardOrchestrateChatMessage(
      "Finance に確認して。資金繰りの前提をレビューしてほしい。",
      { fromAgent: "secretary" }
    );
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.reply).toBe(formatSecretaryConsultCeoReply(result.work_order_ids![0]!));
    const run = runEscalation({
      fromAgent: "secretary",
      tenant: "mal",
      input: {
        subject: "財務確認",
        requirements: "資金繰り前提",
        path: "data/finance/",
        tenant: "mal",
      },
    });
    expect(run.workOrders).toHaveLength(1);
    expect(run.workOrders[0]?.to_agent).toBe("executive_steward");
    expect(run.workOrders[0]?.from_agent).toBe("secretary");
    expect(run.workOrders.some((w) => w.to_agent === "finance")).toBe(false);
  });

  it("owner-direct steward orchestration still reaches field agents", () => {
    const result = handleStewardOrchestrateChatMessage(
      "Finance に確認して。資金繰りの前提をレビューしてほしい。"
    );
    expect(result.ok).toBe(true);
    expect(result.reply).toMatch(/財務担当に確認を依頼しました/);
  });
});

describe("secretary cannot propose tenant config", () => {
  it("refuses ISO enable from the secretary desk", () => {
    const result = handleTenantConfigProposeChatMessage("ISO-50001 を有効化", {
      proposedBy: "op-steward",
      fromAgent: "secretary",
    });
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.change_id).toBeUndefined();
    expect(result.reply).toMatch(/スチュワード/);
  });
});
