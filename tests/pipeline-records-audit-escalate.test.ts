import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { runPipelineWeekly } from "../src/commands/pipeline.js";
import { listWorkOrders } from "../src/lib/escalate.js";
import { routingQueueDir } from "../src/lib/routing.js";

const mocks = vi.hoisted(() => ({
  runEventsChainAttest: vi.fn(() => {
    throw new Error("simulated attest failure");
  }),
  checkExecutiveBackupForWeekly: vi.fn(() => ({
    ok: false,
    message: "simulated executive backup missing",
  })),
  checkTenantBackupForWeekly: vi.fn(() => ({
    ok: true,
    kind: "ok_unconfigured" as const,
    message: "テナント退避先が未設定",
  })),
  runDashboard: vi.fn(),
  runOpsDaily: vi.fn(),
  runExecutiveBrief: vi.fn(),
}));

vi.mock("../src/commands/company-events.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/company-events.js")>();
  return {
    ...actual,
    runEventsChainAttest: mocks.runEventsChainAttest,
  };
});

vi.mock("../src/lib/executive-backup.js", () => ({
  checkExecutiveBackupForWeekly: mocks.checkExecutiveBackupForWeekly,
}));

vi.mock("../src/lib/tenant-backup.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/tenant-backup.js")>();
  return {
    ...actual,
    checkTenantBackupForWeekly: mocks.checkTenantBackupForWeekly,
  };
});

vi.mock("../src/commands/dashboard.js", () => ({ runDashboard: mocks.runDashboard }));
vi.mock("../src/commands/ops.js", () => ({ runOpsDaily: mocks.runOpsDaily }));
vi.mock("../src/commands/executive.js", () => ({ runExecutiveBrief: mocks.runExecutiveBrief }));

describe("pipeline records_audit escalation", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.STEWARD_OPERATOR_AUTH = "0";
    process.env.STEWARD_WEEKLY_BRIEF = "0";
    mocks.runEventsChainAttest.mockImplementation(() => {
      throw new Error("simulated attest failure");
    });
    mocks.checkExecutiveBackupForWeekly.mockReturnValue({
      ok: false,
      message: "simulated executive backup missing",
    });
    mocks.checkTenantBackupForWeekly.mockReturnValue({
      ok: true,
      kind: "ok_unconfigured",
      message: "テナント退避先が未設定",
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("aggregates failures and creates work orders before exit", () => {
    const pendingBefore = listWorkOrders("pending").length;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);

    expect(() => runPipelineWeekly({ skipValidate: true })).toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.runEventsChainAttest).toHaveBeenCalled();
    expect(mocks.checkExecutiveBackupForWeekly).toHaveBeenCalled();

    const pendingAfter = listWorkOrders("pending");
    expect(pendingAfter.length).toBeGreaterThan(pendingBefore);

    const queueDir = routingQueueDir();
    if (existsSync(queueDir)) {
      const created = readdirSync(queueDir).filter((f) =>
        pendingAfter.some((w) => f.startsWith(w.id)),
      );
      expect(created.length).toBeGreaterThan(0);
    }
  });

  it("points a missing tenant backup stamp at snapshot, not chain attest", () => {
    mocks.runEventsChainAttest.mockImplementation(() => undefined);
    mocks.checkExecutiveBackupForWeekly.mockReturnValue({
      ok: true,
      message: "executive backup ok",
    });
    mocks.checkTenantBackupForWeekly.mockReturnValue({
      ok: false,
      kind: "stamp_missing",
      message: "テナント退避のスタンプが無い",
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    expect(() => runPipelineWeekly({ skipValidate: true })).toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);

    const order = listWorkOrders("pending").find((w) =>
      (w.subject ?? "").includes("tenant backup"),
    );
    expect(order?.requirements).toContain("orgos tenant backup snapshot");
    expect(order?.requirements).not.toContain("events chain attest");
  });

  it("points a forbidden tenant remote at git-remote check, not chain attest", () => {
    mocks.runEventsChainAttest.mockImplementation(() => undefined);
    mocks.checkExecutiveBackupForWeekly.mockReturnValue({
      ok: true,
      message: "executive backup ok",
    });
    mocks.checkTenantBackupForWeekly.mockReturnValue({
      ok: false,
      kind: "forbidden_remote",
      message: "テナント履歴のリモートに github.com は使えません",
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    expect(() => runPipelineWeekly({ skipValidate: true })).toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);

    const order = listWorkOrders("pending").find((w) =>
      (w.subject ?? "").includes("tenant backup"),
    );
    expect(order?.requirements).toContain("orgos tenant git-remote check");
    expect(order?.requirements).not.toContain("events chain attest");
    expect(order?.requirements).not.toContain("orgos tenant backup snapshot");
  });
});
