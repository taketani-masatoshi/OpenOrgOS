import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  getTenantMailMessageBody,
  getTenantMailMessages,
  getTenantMailThreads,
} from "../src/lib/wire-console/human-mail.js";
import {
  resetWireConsoleTestTenant,
  WIRE_CONSOLE_TEST_TENANT,
} from "./helpers/wire-console-test-fixture.js";

describe("wire console human mail projection", () => {
  beforeEach(() => {
    resetWireConsoleTestTenant();
    setTenantId(WIRE_CONSOLE_TEST_TENANT);
  });

  it("lists inbox and outbox messages with human subjects", () => {
    const messages = getTenantMailMessages(WIRE_CONSOLE_TEST_TENANT, "all");
    expect(messages.length).toBeGreaterThan(0);
    const inbox = messages.filter((m) => m.folder === "inbox");
    const outbox = messages.filter((m) => m.folder === "outbox");
    expect(inbox.length).toBeGreaterThan(0);
    expect(outbox.length).toBeGreaterThan(0);
    for (const m of messages) {
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.preview.length).toBeGreaterThan(0);
      expect(m.status_label.length).toBeGreaterThan(0);
      expect(m.thread_id.length).toBeGreaterThan(0);
    }
  });

  it("groups messages into threads by contract or transaction", () => {
    const threads = getTenantMailThreads(WIRE_CONSOLE_TEST_TENANT, "all");
    expect(threads.length).toBeGreaterThan(0);
    for (const t of threads) {
      expect(t.messages.length).toBeGreaterThan(0);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.thread_id).toBe(t.messages[0]!.thread_id);
    }
  });

  it("returns human message body for outbox event", () => {
    const messages = getTenantMailMessages(WIRE_CONSOLE_TEST_TENANT, "outbox");
    const first = messages[0];
    expect(first).toBeDefined();
    const body = getTenantMailMessageBody(WIRE_CONSOLE_TEST_TENANT, first!.id);
    expect(body).toBeDefined();
    expect(body!.subject).toBe(first!.subject);
    expect(body!.body_text.length).toBeGreaterThan(0);
    expect(body!.from_label.length).toBeGreaterThan(0);
  });

  it("filters pending folder to approval pseudo-messages", () => {
    const pending = getTenantMailMessages(WIRE_CONSOLE_TEST_TENANT, "pending");
    for (const m of pending) {
      expect(m.folder).toBe("pending");
      expect(m.kind).toBe("approval");
    }
  });
});
