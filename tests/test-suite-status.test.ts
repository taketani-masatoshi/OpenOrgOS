import { describe, it, expect, afterEach } from "vitest";
import {
  clearTestSuiteStatus,
  readTestSuiteStatus,
  writeTestSuiteFailed,
  writeTestSuitePassed,
} from "../src/lib/protocol/test-suite-status.js";

describe("test suite status marker", () => {
  afterEach(() => {
    clearTestSuiteStatus();
  });

  it("starts empty after clear", () => {
    clearTestSuiteStatus();
    expect(readTestSuiteStatus()).toBeNull();
  });

  it("records pass marker", () => {
    writeTestSuitePassed("vitest");
    expect(readTestSuiteStatus()?.passed).toBe(true);
  });

  it("records fail marker", () => {
    writeTestSuiteFailed("vitest");
    expect(readTestSuiteStatus()?.passed).toBe(false);
  });
});
