import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildWebhookBodies,
  parseInboundWebhookBody,
} from "../src/lib/protocol/webhook-bridge.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";

describe("protocol webhook bridge", () => {
  beforeEach(() => setTenantId("demo"));

  it("builds legacy body by default", () => {
    const { format, body } = buildWebhookBodies("legacy", "work_order_complete", { id: "IMP-1" });
    expect(format).toBe("legacy");
    const parsed = JSON.parse(body) as { event: string; payload: { id: string } };
    expect(parsed.event).toBe("work_order_complete");
    expect(parsed.payload.id).toBe("IMP-1");
  });

  it("builds dual mode with legacy and envelope", () => {
    const { body } = buildWebhookBodies("dual", "merge_complete", { ref: "IMP-2" });
    const parsed = JSON.parse(body) as { legacy: { event: string }; envelope: unknown };
    expect(parsed.legacy.event).toBe("merge_complete");
    expect(eventEnvelopeSchema.safeParse(parsed.envelope).success).toBe(true);
  });

  it("parses inbound dual payload", () => {
    const dual = buildWebhookBodies("dual", "test_event", { x: 1 });
    const parsed = parseInboundWebhookBody(JSON.parse(dual.body));
    expect(parsed.legacy?.event).toBe("test_event");
    expect(parsed.envelope?.protocol_version).toBe("1");
  });

  it("parses standalone envelope", () => {
    const env = buildWebhookBodies("envelope", "test", {});
    const parsed = parseInboundWebhookBody(JSON.parse(env.body));
    expect(parsed.envelope?.event.type).toMatch(/^committee\.webhook\./);
  });
});
