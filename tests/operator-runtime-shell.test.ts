import { describe, expect, it } from "vitest";
import { buildShellCommand, resolveOperatorRuntime } from "../src/lib/operator-runtime/config.js";
import { runShellDispatch } from "../src/lib/operator-runtime/shell.js";

describe("operator runtime shell", () => {
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
});
