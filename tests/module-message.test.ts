import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendModuleMessage,
  listPendingModuleMessagesFor,
  resetModuleMessagesForTests,
} from "../src/lib/module-messages/store.js";

describe("module messages", () => {
  beforeEach(() => {
    resetModuleMessagesForTests();
  });

  afterEach(() => {
    resetModuleMessagesForTests();
  });

  it("stores and lists pending integration inbox messages", () => {
    appendModuleMessage({
      message_id: "MSG-20260824-testmsg01",
      schema: "orgos.module.message.v1",
      from: { id: "finance", kind: "agent" },
      to: { id: "integration", kind: "agent" },
      intent: "inform",
      confidentiality: "L1",
      status: "pending",
      refs: [{ work_order_id: "IMP-TEST-001" }],
      payload_summary: "Finance dispatch note for integration",
      created_at: new Date().toISOString(),
    });

    const rows = listPendingModuleMessagesFor("integration");
    expect(rows.some((r) => r.message_id === "MSG-20260824-testmsg01")).toBe(true);
  });
});
