import { describe, expect, it } from "vitest";
import { assertDisposableTestWorkspace } from "./helpers/test-workspace-guard.js";

describe("test workspace guard", () => {
  it("rejects a regular checkout and a nonexisting disposable path", () => {
    expect(() => assertDisposableTestWorkspace(process.cwd(), {})).toThrow(/Refusing to modify/);
    expect(() => assertDisposableTestWorkspace(process.cwd(), {
      ORGOS_TEST_DISPOSABLE_ROOT: "/no-such-disposable-workspace",
    })).toThrow(/Refusing to modify/);
  });

  it("accepts an explicitly selected checkout or GitHub Actions", () => {
    expect(() => assertDisposableTestWorkspace(process.cwd(), {
      ORGOS_TEST_DISPOSABLE_ROOT: process.cwd(),
    })).not.toThrow();
    expect(() => assertDisposableTestWorkspace(process.cwd(), {
      CI: "true", GITHUB_ACTIONS: "true",
    })).not.toThrow();
    expect(() => assertDisposableTestWorkspace(process.cwd(), { CI: "true" })).toThrow();
  });
});
