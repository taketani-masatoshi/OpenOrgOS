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

vi.mock("../src/commands/dashboard.js", () => ({ runDashboard: mocks.runDashboard }));
vi.mock("../src/commands/ops.js", () => ({ runOpsDaily: mocks.runOpsDaily }));
vi.mock("../src/commands/executive.js", () => ({ runExecutiveBrief: mocks.runExecutiveBrief }));

describe("pipeline records_audit escalation", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.STEWARD_OPERATOR_AUTH = "0";
    process.env.STEWARD_WEEKLY_BRIEF = "0";
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
});
