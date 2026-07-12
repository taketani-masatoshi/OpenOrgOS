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
        uuid: () => "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(getIdGenerator().uniqueId("PAUD")).toBe("PAUD-FIXED");
    expect(getIdGenerator().uuid()).toBe("00000000-0000-4000-8000-000000000001");
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
        uuid: () => "uuid-test",
      },
    });
    resetRuntimeContext();
    expect(getIdGenerator().uniqueId("Q")).not.toBe("TEST-ID");
  });
});
