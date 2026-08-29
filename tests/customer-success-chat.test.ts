// @catalog-ids: customer_success
import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  handleCustomerSuccessChatMessage,
  isCustomerSuccessChatIntent,
  isCustomerSuccessDetailRequest,
  mentionsCustomerSuccessDomain,
} from "../src/lib/steward-chat/customer-success-intent.js";
import { customerSuccessProvider } from "../src/lib/operator-facts/providers/customer-success.js";
import { matchProviderByIntent } from "../src/lib/operator-facts/registry.js";

describe("customer success steward chat (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("detects customer success KPI intents", () => {
    expect(isCustomerSuccessChatIntent("顧客の状況は？")).toBe(true);
    expect(isCustomerSuccessChatIntent("解約リスクは？")).toBe(true);
    expect(isCustomerSuccessChatIntent("NPS は？")).toBe(true);
    expect(isCustomerSuccessChatIntent("商談の状況は？")).toBe(false);
  });

  it("detects domain and detail requests", () => {
    expect(mentionsCustomerSuccessDomain("カスタマーサクセス")).toBe(true);
    expect(isCustomerSuccessDetailRequest("顧客の連絡先を教えて")).toBe(true);
    expect(isCustomerSuccessDetailRequest("顧客の状況は？")).toBe(false);
  });

  it("returns deterministic CEO reply without L2 fields", () => {
    const result = handleCustomerSuccessChatMessage("顧客ヘルスは？");
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/顧客/);
    expect(result.reply).not.toMatch(/@/);
    expect(result.reply).not.toMatch(/03-/);
  });

  it("registers operator_customer_success fact provider", () => {
    const provider = matchProviderByIntent("顧客の状況は？");
    expect(provider?.toolName).toBe("operator_customer_success");
    const result = customerSuccessProvider.run();
    expect(result.ok).toBe(true);
    expect(result.coverage).toBe("registered");
  });
});
