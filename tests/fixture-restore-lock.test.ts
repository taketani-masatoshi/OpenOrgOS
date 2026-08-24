import { describe, expect, it } from "vitest";
import {
  isLockAbandoned,
  parseLockOwnerText,
  shouldPruneSnapshotDir,
} from "./helpers/fixture-restore-lock.js";

describe("fixture restore lock helpers", () => {
  it("parses JSON owner and legacy pid/startedAt text", () => {
    expect(parseLockOwnerText('{"token":"1-0","pid":11,"startedAt":100}')).toEqual({
      token: "1-0",
      pid: 11,
      startedAt: 100,
    });
    expect(parseLockOwnerText("42\n900")).toEqual({
      token: "legacy-42",
      pid: 42,
      startedAt: 900,
    });
    expect(parseLockOwnerText("not-a-lock")).toBeNull();
  });

  it("treats same-token, dead pid, and stale age as abandoned", () => {
    const owner = { token: "w-0", pid: 7, startedAt: 0 };
    expect(
      isLockAbandoned(owner, {
        workerToken: "w-0",
        now: 10,
        staleMs: 1000,
        processExists: () => true,
      }),
    ).toBe(true);
    expect(
      isLockAbandoned({ ...owner, token: "other" }, {
        workerToken: "w-0",
        now: 10,
        staleMs: 1000,
        processExists: () => false,
      }),
    ).toBe(true);
    expect(
      isLockAbandoned({ ...owner, token: "other" }, {
        workerToken: "w-0",
        now: 5000,
        staleMs: 1000,
        processExists: () => true,
      }),
    ).toBe(true);
    expect(
      isLockAbandoned({ ...owner, token: "other" }, {
        workerToken: "w-0",
        now: 10,
        staleMs: 1000,
        processExists: () => true,
      }),
    ).toBe(false);
  });

  it("prunes dead snapshot dirs and keeps live foreign pids", () => {
    expect(
      shouldPruneSnapshotDir("9-0", {
        workerToken: "9-0",
        selfPid: 9,
        processExists: () => true,
      }),
    ).toBe("keep-self");
    expect(
      shouldPruneSnapshotDir("88-1", {
        workerToken: "9-0",
        selfPid: 9,
        processExists: (pid) => pid === 88,
      }),
    ).toBe("keep-live");
    expect(
      shouldPruneSnapshotDir("77-1", {
        workerToken: "9-0",
        selfPid: 9,
        processExists: () => false,
      }),
    ).toBe("prune");
  });
});
