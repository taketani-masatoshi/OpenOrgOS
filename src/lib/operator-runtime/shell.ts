import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildShellCommand,
  listAllowedShellBinaries,
  type ResolvedShellCommand,
} from "./config.js";
import { getTenantId } from "../tenant.js";
import { tenantDispatchRoot, assertDispatchCwdWithinTenant } from "../org-boundary.js";
import { getCliOperatorContext } from "../console-auth/cli-operator.js";
import {
  isProdSecurityMode,
  operatorHasPermission,
} from "../console-auth/operator-rbac.js";
import { ensureAiaRunWorkspace } from "../aia/scheduler.js";
import { getFsGuardAgent, isFsGuardEnforced } from "../org/fs-guard/index.js";

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

function assertShellDispatchAllowed(profile?: string): void {
  const ctx = getCliOperatorContext();
  if (!ctx) return;
  if (profile === "aider" || profile?.includes("shell")) {
    if (!operatorHasPermission(ctx.record, "agent:shell")) {
      throw new Error(
        `Operator ${ctx.record.operator_id} lacks agent:shell permission for shell profile "${profile ?? "default"}"`
      );
    }
  }
}

export function assertResolvedShellCommandSafe(resolved: ResolvedShellCommand): void {
  const joined = resolved.command.join(" ");
  const hasYesFlag =
    resolved.command.includes("--yes") || /(?:^|\s)--yes(?:\s|$)/.test(joined);
  if (hasYesFlag && isProdSecurityMode() && process.env.ORGOS_SHELL_AUTO_YES !== "1") {
    throw new Error(
      "Shell --yes is blocked in production — set ORGOS_SHELL_AUTO_YES=1 to allow non-interactive shell"
    );
  }
  if (/\bgit\b/.test(joined)) {
    const op = getCliOperatorContext();
    if (op && !operatorHasPermission(op.record, "git:write")) {
      throw new Error(
        `Operator ${op.record.operator_id} lacks git:write for shell git command`
      );
    }
  }
  assertShellCommandAllowlist(resolved.command);
  assertShellCommandAvoidsCanonicalWrites(resolved.command);
}

export function assertShellCommandAllowlist(command: string[]): void {
  if (!isFsGuardEnforced()) return;
  const bin = (command[0]?.split(/[/\\]/).pop() ?? "").trim();
  if (!bin || !listAllowedShellBinaries().has(bin)) {
    throw new Error(
      `Shell binary "${bin || "(empty)"}" is not in runtime allowlist when FS-guard is on`
    );
  }
}

export function assertShellCwdIsRunWorkspace(cwd: string): void {
  if (!isFsGuardEnforced()) return;
  const normalized = cwd.replace(/\\/g, "/");
  if (!/\/data\/scratch\/aia-runs\//.test(normalized)) {
    throw new Error(
      `Shell cwd must be under data/scratch/aia-runs/ when FS-guard is on (got ${cwd})`
    );
  }
}

export function assertShellCommandAvoidsCanonicalWrites(command: string[]): void {
  if (!isFsGuardEnforced()) return;
  const shellBin = (command[0]?.split(/[/\\]/).pop() ?? "").toLowerCase();
  const isShellInterpreter = /^(bash|sh|zsh|dash|ksh)$/.test(shellBin);
  if (!isShellInterpreter) return;
  const joined = command.join(" ").replace(/\\/g, "/");
  if (/\borgos\b/.test(joined) && /\bguard\b/.test(joined)) return;
  const writesCanonical =
    /(?:^|[\s"'`])(?:>{1,2}|tee\b).*(?:data\/(?!scratch\/)|docs\/|records\/)/.test(joined) ||
    /(?:\bcp\b|\bmv\b|\brm\b|\btouch\b|\binstall\b)\s+\S.*(?:data\/(?!scratch\/)|docs\/|records\/)/.test(
      joined
    );
  if (writesCanonical) {
    throw new Error(
      "Shell command must not write canonical data/, docs/, or records/ paths; use orgos guard apply"
    );
  }
  const root = tenantDispatchRoot().replace(/\\/g, "/");
  if (
    /(?:^|[\s"'`])(?:>{1,2}|tee\b)/.test(joined) &&
    ((joined.includes(`${root}/data/`) && !joined.includes(`${root}/data/scratch/`)) ||
      joined.includes(`${root}/docs/`) ||
      joined.includes(`${root}/records/`))
  ) {
    throw new Error(
      "Shell command must not redirect onto absolute canonical tenant paths; use orgos guard apply"
    );
  }
}

export async function runShellDispatch(
  promptText: string,
  opts?: { profile?: string; workOrderId?: string; agentId?: string }
): Promise<ShellDispatchResult> {
  assertShellDispatchAllowed(opts?.profile);
  const runId = opts?.workOrderId ?? `SHELL-${Date.now()}`;
  const runDir = ensureAiaRunWorkspace(runId);
  const tenantRoot = tenantDispatchRoot();
  const dir = mkdtempSync(join(tmpdir(), "orgos-shell-"));
  const promptPath = join(dir, `${opts?.workOrderId ?? "prompt"}.md`);
  const agentId = opts?.agentId ?? getFsGuardAgent();
  const footer = [
    "",
    "---",
    "",
    "## Operator 必須手順",
    "",
    `1. 作業ディレクトリは Run 面のみ: \`${runDir}\``,
    "2. `data/` `docs/` `records/` へ直接書き込まない",
    "3. 正本 YAML/MD は `orgos guard apply --agent <id> --path <logical> --from <draft> --expected-sha256 <hex>`",
    "4. 変更後 `npm run orgos -- validate` を実行",
    "5. L2/L3 値を出力に含めない",
    "",
  ].join("\n");
  writeFileSync(promptPath, promptText + footer, "utf-8");

  const ctx = {
    promptPath,
    workspace: runDir,
    tenant: getTenantId(),
    tenantRoot,
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

  if (isFsGuardEnforced()) {
    resolved.cwd = runDir;
    resolved.env = {
      ...resolved.env,
      ORGOS_FS_GUARD: "enforce",
      ...(agentId ? { ORGOS_FS_GUARD_AGENT: agentId } : {}),
    };
  }

  assertDispatchCwdWithinTenant(resolved.cwd);
  assertShellCwdIsRunWorkspace(resolved.cwd);
  assertResolvedShellCommandSafe(resolved);
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
