import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildShellCommand, type ResolvedShellCommand } from "./config.js";
import { ROOT_DIR, getTenantId } from "../tenant.js";

export interface ShellDispatchResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  detail: string;
  promptPath?: string;
}

function runCommand(resolved: ResolvedShellCommand): Promise<ShellDispatchResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const child = spawn(resolved.command[0]!, resolved.command.slice(1), {
      cwd: resolved.cwd,
      env: { ...process.env, ...resolved.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer =
      resolved.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGTERM");
          }, resolved.timeoutMs)
        : undefined;

    child.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      const exitCode = code;
      resolve({
        ok: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        detail: (stdout || stderr || `exit ${exitCode}`).slice(0, 500),
      });
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: err.message,
        detail: err.message,
      });
    });
  });
}

export async function runShellDispatch(
  promptText: string,
  opts?: { profile?: string; workOrderId?: string }
): Promise<ShellDispatchResult> {
  const dir = mkdtempSync(join(tmpdir(), "orgos-shell-"));
  const promptPath = join(dir, `${opts?.workOrderId ?? "prompt"}.md`);
  const footer = [
    "",
    "---",
    "",
    "## Operator 必須手順",
    "",
    "1. 変更後 `npm run orgos -- validate` を実行",
    "2. 担当 Primary Folders のみ編集",
    "3. L2/L3 値を出力に含めない",
    "",
  ].join("\n");
  writeFileSync(promptPath, promptText + footer, "utf-8");

  const ctx = {
    promptPath,
    workspace: ROOT_DIR,
    tenant: getTenantId(),
  };
  const resolved = buildShellCommand(ctx, opts?.profile);
  if (!resolved) {
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      detail: "shell adapter not configured — set steward/platform/agent/runtime.yaml",
      promptPath,
    };
  }

  const result = await runCommand(resolved);
  return { ...result, promptPath };
}

export async function runShellAsk(
  userMessage: string,
  systemContext: string,
  opts?: { profile?: string }
): Promise<ShellDispatchResult> {
  const prompt = [`# System context`, "", systemContext, "", `# User`, "", userMessage].join("\n");
  return runShellDispatch(prompt, { profile: opts?.profile, workOrderId: "chat-ask" });
}
