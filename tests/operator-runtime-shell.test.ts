import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { runShellDispatch } from "../src/lib/operator-runtime/shell.js";
import { buildShellCommand, resolveOperatorRuntime } from "../src/lib/operator-runtime/config.js";
import { tenantDispatchRoot } from "../src/lib/org-boundary.js";
import { ensureAiaRunWorkspace } from "../src/lib/aia/scheduler.js";

describe("operator runtime shell", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
  });

  afterEach(() => {
    process.env = { ...env };
    delete process.env.ORGOS_FS_GUARD;
    delete process.env.ORGOS_FS_GUARD_AGENT;
  });

  it("resolves shell as default runtime", () => {
    expect(resolveOperatorRuntime("auto")).toBe("shell");
  });

  it("builds shell command with placeholders", () => {
    const cmd = buildShellCommand({
      promptPath: "/tmp/prompt.md",
      workspace: "/workspace",
      tenant: "demo",
    });
    expect(cmd).not.toBeNull();
    expect(cmd!.command.some((p) => p.includes("/tmp/prompt.md") || p === "{prompt}")).toBe(true);
    expect(cmd!.cwd).toBe("/workspace");
  });

  it("runs default echo adapter successfully", async () => {
    const result = await runShellDispatch("# test\n\nReply ok", { workOrderId: "TEST" });
    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
  });

  it("overrides cwd to run workspace when FS-guard is enforced", async () => {
    setTenantId("demo");
    process.env.ORGOS_FS_GUARD = "enforce";
    const workOrderId = "TEST-ENFORCE-CWD";
    const runDir = ensureAiaRunWorkspace(workOrderId);
    const result = await runShellDispatch("# enforce cwd\n", {
      workOrderId,
      agentId: "executive",
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(runDir.replace(/\\/g, "/")).toMatch(/data\/scratch\/aia-runs\//);
  });
});
