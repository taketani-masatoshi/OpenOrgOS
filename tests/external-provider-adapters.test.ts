import { describe, expect, it } from "vitest";
import {
  PROVIDER_AUTH_MODES,
  mapPayPalCaptureEvent,
} from "../src/lib/finance/external-provider-adapters.js";

describe("external provider adapter contracts", () => {
  it("declares provider auth modes and preserves PayPal currency precision", () => {
    expect(Object.keys(PROVIDER_AUTH_MODES)).toHaveLength(6);
    for (const [currency, minorUnit] of [
      ["JPY", 0],
      ["USD", 2],
      ["BHD", 3],
    ] as const) {
      const [entry] = mapPayPalCaptureEvent(
        {
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource: { id: "synthetic-capture", amount: { value: "12", currency_code: currency } },
        },
        "synthetic-tenant"
      );
      expect(entry).toMatchObject({ currency, minor_unit: minorUnit, amount: "12" });
    }
    expect(
      mapPayPalCaptureEvent(
        {
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource: { id: "synthetic-capture", amount: { value: "12", currency_code: "UNKNOWN" } },
        },
        "synthetic-tenant"
      )
    ).toEqual([]);
  });
});
