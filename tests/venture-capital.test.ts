import { describe, expect, it } from "vitest";
import { readYamlFile } from "../src/lib/utils.js";
import {
  fundsFileSchema,
  portfolioFileSchema,
} from "../schemas/venture-capital.js";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

const seedVc = join(
  ROOT_DIR,
  "steward/modules/venture_capital/seed"
);

describe("venture-capital schema", () => {
  it("parses seed funds example", () => {
    const data = readYamlFile(
      join(seedVc, "funds.yaml.example"),
      fundsFileSchema
    );
    expect(data.funds[0]?.id).toBe("FUND-001");
  });

  it("parses seed portfolio example with valid fund_id", () => {
    const funds = readYamlFile(
      join(seedVc, "funds.yaml.example"),
      fundsFileSchema
    );
    const portfolio = readYamlFile(
      join(seedVc, "portfolio.yaml.example"),
      portfolioFileSchema
    );
    const fundIds = new Set(funds.funds.map((f) => f.id));
    for (const pc of portfolio.companies) {
      expect(fundIds.has(pc.fund_id)).toBe(true);
    }
  });
});
