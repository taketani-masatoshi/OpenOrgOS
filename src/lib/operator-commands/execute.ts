import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  commandPlanSchema,
  commandRunResultSchema,
  type CommandPlan,
  type CommandRunResult,
} from "../../../schemas/operator-commands.js";
import type { OperatorPermission } from "../../../schemas/org/operator.js";
import { resolveRegisteredSkillInvocation } from "../../commands/skills.js";
import { appendAuditEvent } from "../audit-log.js";
import { findProviderById } from "../operator-facts/registry.js";
import { getDataDir } from "../utils.js";
import { argsToSkillRunOptions, resolveCommandPlan } from "./resolve.js";
import { getSkillById } from "../skill-registry.js";

const PLAN_TTL_MS = 15 * 60_000;

function plansDir(): string {
  const dir = join(getDataDir(), "chat", "command-plans");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function planPath(planId: string): string {
  return join(plansDir(), `${planId}.json`);
}

export function saveCommandPlan(plan: CommandPlan): void {
  writeFileSync(planPath(plan.plan_id), JSON.stringify(plan, null, 2), "utf-8");
}

export function loadCommandPlan(planId: string): CommandPlan | null {
  const path = planPath(planId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    const plan = commandPlanSchema.parse(raw);
    if (plan.expires_at && Date.parse(plan.expires_at) < Date.now()) {
      unlinkSync(path);
      return null;
    }
    return plan;
  } catch {
    return null;
  }
}

export function deleteCommandPlan(planId: string): void {
  const path = planPath(planId);
  if (existsSync(path)) unlinkSync(path);
}

/**
 * Capture console.log / console.error / console.warn while running a skill handler.
 */
export async function captureSkillOutput(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const push = (...args: unknown[]) => {
    chunks.push(
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
        .join(" ")
    );
  };
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => {
    push(...args);
  };
  console.error = (...args: unknown[]) => {
    push(...args);
  };
  console.warn = (...args: unknown[]) => {
    push(...args);
  };
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
  }
  return chunks.join("\n").trim();
}

export interface ExecuteCommandOptions {
  plan: CommandPlan;
  operatorId?: string;
  permissions?: OperatorPermission[];
  /** Force run even when status is needs_confirmation (after UI confirm). */
  confirmed?: boolean;
}

function permissionOk(
  permissions: OperatorPermission[] | undefined,
  required: OperatorPermission | undefined
): boolean {
  if (!required) return true;
  if (!permissions) return true;
  return permissions.includes(required);
}

export async function executeCommandPlan(
  opts: ExecuteCommandOptions
): Promise<CommandRunResult> {
  const { plan } = opts;

  if (!permissionOk(opts.permissions, plan.permission)) {
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error: `forbidden: ${plan.permission}`,
      cli_display: plan.cli_display,
    });
  }

  if (plan.status === "approval_gate") {
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error:
        plan.message ??
        "Approval-gated command cannot be executed from chat — use Wire / broker / approval UI",
      cli_display: plan.cli_display,
    });
  }

  if (plan.status === "ambiguous" || plan.status === "not_found" || plan.status === "forbidden") {
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error: plan.message ?? plan.status,
      cli_display: plan.cli_display,
    });
  }

  if (plan.status === "needs_args") {
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error: `missing args: ${(plan.missing_args ?? []).join(", ")}`,
      cli_display: plan.cli_display,
    });
  }

  if (plan.status === "needs_confirmation" && !opts.confirmed) {
    saveCommandPlan(plan);
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error: "confirmation required",
      cli_display: plan.cli_display,
      output: "",
    });
  }

  if (!plan.skill_id) {
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      error: "no skill_id on plan",
    });
  }

  const skill = getSkillById(plan.skill_id);
  if (!skill) {
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error: `unknown skill: ${plan.skill_id}`,
    });
  }

  const runOpts = argsToSkillRunOptions(plan.args ?? {});
  const resolution = resolveRegisteredSkillInvocation(plan.skill_id, runOpts);
  if (resolution.status !== "ready") {
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error: `${resolution.status}: ${resolution.reason}`,
      cli_display: plan.cli_display,
    });
  }

  appendAuditEvent({
    event: "route_dispatch",
    ref: plan.plan_id,
    actor: opts.operatorId ?? "chat",
    detail: `chat_command_started:${plan.skill_id}:${plan.cli_display ?? ""}`,
  });

  try {
    const output = await captureSkillOutput(() => resolution.handler(runOpts));
    appendAuditEvent({
      event: "route_dispatch",
      ref: plan.plan_id,
      actor: opts.operatorId ?? "chat",
      detail: `chat_command_succeeded:${plan.skill_id}`,
    });
    deleteCommandPlan(plan.plan_id);
    return commandRunResultSchema.parse({
      ok: true,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      output: output.slice(0, 24_000),
      cli_display: plan.cli_display,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    appendAuditEvent({
      event: "route_dispatch",
      ref: plan.plan_id,
      actor: opts.operatorId ?? "chat",
      detail: `chat_command_failed:${plan.skill_id}: ${reason}`,
    });
    return commandRunResultSchema.parse({
      ok: false,
      plan_id: plan.plan_id,
      skill_id: plan.skill_id,
      error: reason,
      cli_display: plan.cli_display,
    });
  }
}

/**
 * Resolve + optionally auto-run read commands. Write/approval return a saved plan.
 */
export async function handleChatCommandMessage(opts: {
  message: string;
  permissions?: OperatorPermission[];
  operatorId?: string;
  skillId?: string;
  args?: Record<string, string | number | boolean | null>;
}): Promise<{
  handled: boolean;
  reply?: string;
  plan?: CommandPlan;
  run?: CommandRunResult;
}> {
  const plan = resolveCommandPlan({
    message: opts.message,
    permissions: opts.permissions,
    skillId: opts.skillId,
    args: opts.args,
  });

  if (plan.status === "not_found") {
    return { handled: false };
  }

  if (plan.status === "ambiguous") {
    const lines = [
      "複数のコマンドが候補です。選んでください:",
      ...plan.candidates.map(
        (c, i) => `${i + 1}. **${c.label}** (\`${c.cli_display}\`) · score=${c.score}`
      ),
    ];
    saveCommandPlan(plan);
    return { handled: true, reply: lines.join("\n"), plan };
  }

  if (plan.status === "forbidden") {
    return {
      handled: true,
      reply: plan.message ?? `権限がありません: ${plan.permission}`,
      plan,
    };
  }

  if (plan.status === "approval_gate") {
    saveCommandPlan(plan);
    return {
      handled: true,
      reply: [
        `**${plan.label}** は人間ゲートです。`,
        plan.cli_display ? `\`${plan.cli_display}\`` : "",
        plan.message ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      plan,
    };
  }

  if (plan.status === "needs_args" || plan.status === "needs_confirmation") {
    saveCommandPlan(plan);
    const header =
      plan.status === "needs_args"
        ? `**${plan.label}** — 不足パラメータ: ${(plan.missing_args ?? []).join(", ")}`
        : `**${plan.label}** — 実行確認`;
    return {
      handled: true,
      reply: [header, plan.cli_display ? `\`${plan.cli_display}\`` : ""].filter(Boolean).join("\n"),
      plan,
    };
  }

  // ready (read) — execute immediately
  const run = await executeCommandPlan({
    plan,
    operatorId: opts.operatorId,
    permissions: opts.permissions,
    confirmed: true,
  });
  if (!run.ok) {
    return {
      handled: true,
      reply: `実行失敗: ${run.error ?? "unknown"}`,
      plan,
      run,
    };
  }
  // Prefer FactProvider CEO brief when skill maps to a registered provider
  // (CLI stdout is the long report — not suitable as the chat answer).
  const factBrief = formatChatBriefFromFactProvider(plan.skill_id);
  const reply = factBrief ?? run.output?.trim() ?? `**${plan.label}** 完了`;
  return { handled: true, reply, plan, run };
}

/** Chat answer for read skills that also have a FactProvider — brief, not CLI dump. */
function formatChatBriefFromFactProvider(skillId: string | undefined): string | undefined {
  if (!skillId) return undefined;
  const provider = findProviderById(skillId);
  if (!provider) return undefined;
  const result = provider.run({});
  return result.reply ?? provider.format(result.view);
}

export function refreshPlanArgs(
  plan: CommandPlan,
  args: Record<string, string | number | boolean | null>
): CommandPlan {
  const skillId = plan.skill_id;
  if (!skillId) return plan;
  const message = typeof args.body === "string" ? args.body : plan.message ?? skillId;
  return resolveCommandPlan({
    message: String(message),
    skillId,
    args: { ...plan.args, ...args },
  });
}

// Ensure TTL constant is referenced for documentation / tests.
export const COMMAND_PLAN_TTL_MS = PLAN_TTL_MS;
