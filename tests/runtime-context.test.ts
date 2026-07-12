import { describe, it, expect, afterEach } from "vitest";
import {
  getClock,
  getIdGenerator,
  resetRuntimeContext,
  setRuntimeContext,
} from "../src/lib/runtime-context.js";

describe("runtime-context", () => {
  afterEach(() => {
    resetRuntimeContext();
  });

  it("getIdGenerator produces deterministic ids when context is injected", () => {
    setRuntimeContext({
      idGenerator: {
        randomSuffix: () => "abcd1234",
        uniqueId: (prefix) => `${prefix}-FIXED`,
      },
    });
    expect(getIdGenerator().uniqueId("PAUD")).toBe("PAUD-FIXED");
  });

  it("getClock returns injected fixed time", () => {
    const fixed = new Date("2026-07-12T00:00:00.000Z");
    setRuntimeContext({
      clock: {
        now: () => fixed,
        nowMs: () => fixed.getTime(),
        nowIso: () => fixed.toISOString(),
      },
    });
    expect(getClock().nowIso()).toBe("2026-07-12T00:00:00.000Z");
  });

  it("resetRuntimeContext restores defaults", () => {
    setRuntimeContext({
      idGenerator: {
        randomSuffix: () => "x",
        uniqueId: () => "TEST-ID",
      },
    });
    resetRuntimeContext();
    expect(getIdGenerator().uniqueId("Q")).not.toBe("TEST-ID");
  });
});
