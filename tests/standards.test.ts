import { describe, expect, it } from "vitest";
import { bcp47Schema, bicSchema, e164PhoneSchema, ibanSchema, isPostalCode, leiSchema, standardAddressSchema, unLocodeSchema } from "../schemas/standards.js";

describe("international standards", () => {
  it("validates common identifiers", () => {
    expect(e164PhoneSchema.parse("+819012345678")).toBe("+819012345678");
    expect(bcp47Schema.parse("ja-JP")).toBe("ja-JP");
    expect(bicSchema.parse("DEUTDEFF")).toBe("DEUTDEFF");
    expect(leiSchema.parse("5493001KJTIIGC8Y1R12")).toBe("5493001KJTIIGC8Y1R12");
    expect(unLocodeSchema.parse("JP TYO".replace(" ", ""))).toBe("JPTYO");
  });

  it("validates IBAN checksum and country postal rules", () => {
    expect(ibanSchema.parse("GB82 WEST 1234 5698 7654 32")).toBe("GB82WEST12345698765432");
    expect(isPostalCode("JP", "100-0001")).toBe(true);
    expect(isPostalCode("US", "10001-1234")).toBe(true);
    expect(isPostalCode("JP", "12345")).toBe(false);
    expect(standardAddressSchema.parse({ country_code: "JP", subdivision_code: "JP-13", postal_code: "100-0001", un_locode: "JPTYO" }).country_code).toBe("JP");
  });
});
