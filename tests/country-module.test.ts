import { describe, expect, it } from "vitest";
import { commonStandardsContract } from "../schemas/country-module.js";
import { getCountryModule } from "../schemas/country-modules/index.js";

describe("country modules", () => {
  it("keeps common standards separate from country-specific rules", () => {
    expect(commonStandardsContract.currency).toBe("ISO 4217");
    expect(getCountryModule("jp")).toMatchObject({ country_code_alpha2: "JP", postal_code_rule_id: "jp-postal-7" });
  });
});
