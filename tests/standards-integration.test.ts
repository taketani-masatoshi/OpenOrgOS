import { describe, expect, it } from "vitest";
import { JP_COUNTRY_MODULE } from "../schemas/country-modules/index.js";
import { iso20022TransactionSchema } from "../schemas/finance/iso20022.js";
import { recordMetadataSchema } from "../schemas/record-metadata.js";

describe("standards integration", () => {
  it("binds JP sources to the country module", () => {
    expect(JP_COUNTRY_MODULE.standards.jis_prefecture).toBe("JIS X 0401");
    expect(JP_COUNTRY_MODULE.standards.postal_authority).toContain("Japan Post");
  });
  it("validates ISO 20022-like transaction and record metadata", () => {
    expect(iso20022TransactionSchema.parse({ message_family: "camt", message_type: "camt.053.001", transaction_id: "x", booking_date: "2026-09-21", amount: "100", currency: "JPY" }).currency).toBe("JPY");
    expect(recordMetadataSchema.parse({ record_id: "r1", record_type: "finance.transaction", created_at: "2026-09-21T00:00:00+09:00", captured_at: "2026-09-21T00:00:00+09:00", source_system: "wise", classification: "L2" }).classification).toBe("L2");
  });
});
