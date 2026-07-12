import { describe, it, expect, afterEach } from "vitest";
import { assertLegacyWebhookDeliveryAllowed } from "../src/lib/protocol/legacy-webhook-sunset.js";
import { validateLegacyWebhookSunset } from "../src/lib/protocol/legacy-webhook-sunset.js";

describe("legacy webhook sunset", () => {
  afterEach(() => {
    delete process.env.ORGOS_STRICT_TRANSPORT;
  });

  it("managed tenants have no legacy_webhook Wire peers", () => {
    expect(validateLegacyWebhookSunset(true)).toEqual([]);
  });

  it("assertLegacyWebhookDeliveryAllowed is no-op unless strict", () => {
    expect(() => assertLegacyWebhookDeliveryAllowed("test")).not.toThrow();
    process.env.ORGOS_STRICT_TRANSPORT = "1";
    expect(() => assertLegacyWebhookDeliveryAllowed("test deliver")).toThrow(/sunset/);
  });
});
