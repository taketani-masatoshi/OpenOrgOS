import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { runOperatorDispatch } from "../src/lib/operator-runtime/ask.js";

describe("operator dispatch unified", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ORGOS_LLM_MOCK = "1";
    process.env.ORGOS_SHELL_PROFILE_AUTO = "0";
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("runOperatorDispatch uses LLM when no shell profile", async () => {
    const result = await runOperatorDispatch("# Work order\n\nSummarize inbox.", {
      workOrderId: "IMP-TEST",
      agent: "secretary",
    });
    expect(result.runtime).toBe("llm-api");
    expect(result.reply).toContain("モック");
  });
});
