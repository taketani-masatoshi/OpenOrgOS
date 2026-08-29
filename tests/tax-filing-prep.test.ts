import { describe, expect, it, beforeEach } from "vitest";
import { runTaxFilingPrepSkill } from "../src/lib/core-skill-runners.js";
import { summarizeTaxFilingGaps, tryLoadTaxFilingGaps } from "../src/lib/finance/tax-filing-gaps.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("tax filing prep skill", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("summary open count matches tax gaps CLI overlay", () => {
    const gaps = tryLoadTaxFilingGaps();
    expect(gaps).not.toBeNull();
    const summary = summarizeTaxFilingGaps(gaps);
    expect(summary.items.length).toBeGreaterThan(0);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      runTaxFilingPrepSkill();
    } finally {
      console.log = origLog;
    }
    const output = logs.join("\n");
    expect(output).toContain(`open ${summary.open}`);
    expect(output).not.toContain("未登録または open なし");
    expect(output).toContain("[deferred]");
  });
});
