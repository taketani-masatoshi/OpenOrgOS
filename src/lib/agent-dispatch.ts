import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dispatchManifestSchema,
  type DispatchManifest,
  type DispatchTask,
} from "../../schemas/queue.js";
import type { Handoff } from "../../schemas/routing.js";
import { loadHandoff, loadHandoffChildren, routingQueueDir } from "./routing.js";
import { getTenantId, ROOT_DIR } from "./tenant.js";
import { currentDate, writeYamlFile } from "./utils.js";
import { pushQueueEvent } from "./queue-db.js";
import { appendAuditEvent } from "./audit-log.js";
import { loadCloudAgentConfig, resolveDispatchRuntime } from "./cloud-agent.js";
import { isLlmApiConfigured } from "./operator-runtime/llm-api.js";
import { runOperatorDispatch } from "./operator-runtime/ask.js";
import { assertActiveTenant, assertIntraOrgAgentTarget } from "./org-boundary.js";
import { scopesForAgent } from "./org/delegation-scopes.js";
import { checkAgentAccess, loadClassificationRegistry } from "./classification.js";

export type DispatchRuntime = "local" | "cloud" | "manifest";

export function isCursorSdkAvailable(): boolean {
  if (!process.env.CURSOR_API_KEY?.trim()) return false;
  try {
    const pkgPath = join(ROOT_DIR, "node_modules", "@cursor", "sdk", "package.json");
    return existsSync(pkgPath);
  } catch {
    return false;
  }
}

export function resolveWorkOrdersForDispatch(id: string): Handoff[] {
  const root = loadHandoff(id);
  if (root.child_ids?.length) {
    return loadHandoffChildren(root);
  }
  if (root.task_type === "implement" || root.id.startsWith("IMP-")) {
    return [root];
  }
  throw new Error(`${id} is not an implement work order or parent`);
}

function readPromptText(relativePath: string): string {
  const abs = join(routingQueueDir(), relativePath);
  if (!existsSync(abs)) return "";
  return readFileSync(abs, "utf-8");
}

export function buildDispatchManifest(
  id: string,
  parallel = 3,
  runtimePref?: DispatchRuntime
): DispatchManifest {
  const workOrders = resolveWorkOrdersForDispatch(id);
  for (const w of workOrders) {
    assertActiveTenant(w.tenant, `dispatch work order ${w.id}`);
    assertIntraOrgAgentTarget(w.to_agent, `dispatch work order ${w.id}`);
    const scopes = scopesForAgent(w.to_agent);
    if (!scopes.length) {
      throw new Error(`Agent ${w.to_agent} has no delegation scopes`);
    }
    if (w.context.path) {
      const reg = loadClassificationRegistry();
      const access = checkAgentAccess(reg, w.to_agent, w.context.path, "write");
      if (!access.allowed) {
        throw new Error(`Dispatch blocked: ${access.reason}`);
      }
    }
  }
  const parent = workOrders[0]?.parent_id ? loadHandoff(workOrders[0].parent_id) : undefined;
  const runtime = resolveDispatchRuntime(runtimePref);
  const sdk = isCursorSdkAvailable();
  const cloudCfg = loadCloudAgentConfig();

  const tasks: DispatchTask[] = workOrders
    .filter((w) => w.status === "pending" || w.status === "dispatched")
    .map((w) => {
      let mode: "cursor_sdk" | "cursor_cloud" | "manifest" = "manifest";
      if (sdk) {
        if (runtime === "cloud" && cloudCfg.cloud?.repository) mode = "cursor_cloud";
        else if (runtime !== "manifest") mode = "cursor_sdk";
      }
      return {
        work_order_id: w.id,
        agent: w.to_agent,
        prompt_path: join(routingQueueDir(), w.agent_prompt_path ?? ""),
        prompt_relative: w.agent_prompt_path,
        mode,
      };
    });

  return dispatchManifestSchema.parse({
    id: `DISP-${currentDate().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    tenant: getTenantId(),
    parent_id: parent?.id ?? (workOrders.length === 1 ? undefined : id),
    parallel,
    tasks,
    cursor_sdk_available: sdk,
  });
}

export function writeDispatchManifest(manifest: DispatchManifest): string {
  const path = join(routingQueueDir(), `${manifest.id}.yaml`);
  writeYamlFile(path, manifest);
  for (const task of manifest.tasks) {
    pushQueueEvent({
      type: "dispatch_requested",
      ref: task.work_order_id,
      payload: { manifest_id: manifest.id, agent: task.agent },
    });
  }
  appendAuditEvent({
    event: "escalate",
    ref: manifest.id,
    detail: `dispatch:${manifest.tasks.length} tasks`,
  });
  return path;
}

export interface DispatchRunResult {
  manifest: DispatchManifest;
  manifestPath: string;
  mode: "cursor_sdk" | "cursor_cloud" | "manifest" | "portable_llm" | "portable_shell";
  results: Array<{ work_order_id: string; ok: boolean; detail: string }>;
}

export interface DispatchRunOptions {
  parallel?: number;
  dryRun?: boolean;
  runtime?: DispatchRuntime;
}

export async function runDispatch(
  id: string,
  options?: DispatchRunOptions
): Promise<DispatchRunResult> {
  const manifest = buildDispatchManifest(id, options?.parallel ?? 3, options?.runtime);
  if (options?.dryRun) {
    return { manifest, manifestPath: "", mode: "manifest", results: [] };
  }

  const manifestPath = writeDispatchManifest(manifest);

  const hasRunnableTask = manifest.tasks.some((t) => t.mode !== "manifest");
  if (!manifest.cursor_sdk_available || !hasRunnableTask) {
    const portableResults: DispatchRunResult["results"] = [];
    let portableMode: DispatchRunResult["mode"] = "manifest";

    for (const task of manifest.tasks) {
      const promptText = readPromptText(task.prompt_relative ?? "");
      if (!promptText) {
        portableResults.push({
          work_order_id: task.work_order_id,
          ok: true,
          detail: `manifest · ${task.prompt_relative ?? task.prompt_path}`,
        });
        continue;
      }

      if (isLlmApiConfigured() || process.env.ORGOS_SHELL_PROFILE) {
        const dispatched = await runOperatorDispatch(promptText, {
          workOrderId: task.work_order_id,
          agent: task.agent,
          profile: process.env.ORGOS_SHELL_PROFILE,
        });
        portableMode = dispatched.runtime === "shell" ? "portable_shell" : "portable_llm";
        portableResults.push({
          work_order_id: task.work_order_id,
          ok: dispatched.ok,
          detail: dispatched.detail.slice(0, 300),
        });
        continue;
      }

      portableResults.push({
        work_order_id: task.work_order_id,
        ok: true,
        detail: `manifest · ${task.prompt_relative ?? task.prompt_path}`,
      });
    }

    return {
      manifest,
      manifestPath,
      mode: portableMode,
      results: portableResults,
    };
  }

  // Optional Cursor SDK — dynamic import avoids hard dependency
  type SdkResult = { status?: string; result?: unknown };
  let Agent: { prompt: (p: string, o: Record<string, unknown>) => Promise<SdkResult> };
  try {
    const sdk = (await new Function('return import("@cursor/sdk")')()) as {
      Agent: typeof Agent;
    };
    Agent = sdk.Agent;
  } catch {
    return {
      manifest,
      manifestPath,
      mode: "manifest",
      results: manifest.tasks.map((t) => ({
        work_order_id: t.work_order_id,
        ok: false,
        detail: "Cursor SDK import failed",
      })),
    };
  }

  const apiKey = process.env.CURSOR_API_KEY!;
  const cloudCfg = loadCloudAgentConfig();
  const parallel = manifest.parallel;
  const results: DispatchRunResult["results"] = [];

  async function runPrompt(task: DispatchTask, useCloud: boolean) {
    const promptText = readPromptText(task.prompt_relative ?? "");
    const prompt = promptText || `Execute work order ${task.work_order_id}`;
    const baseOpts: Record<string, unknown> = {
      apiKey,
      model: { id: cloudCfg.cloud?.model ?? "composer-2.5" },
    };
    if (useCloud && cloudCfg.cloud?.repository) {
      return Agent.prompt(prompt, {
        ...baseOpts,
        cloud: { repository: cloudCfg.cloud.repository, ref: cloudCfg.cloud.ref ?? "main" },
      });
    }
    return Agent.prompt(prompt, { ...baseOpts, local: { cwd: ROOT_DIR } });
  }

  for (let i = 0; i < manifest.tasks.length; i += parallel) {
    const batch = manifest.tasks.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map(async (task) => {
        try {
          const useCloud = task.mode === "cursor_cloud";
          const result = await runPrompt(task, useCloud);
          pushQueueEvent({
            type: "dispatch_complete",
            ref: task.work_order_id,
            status: "done",
            payload: { status: result.status, manifest_id: manifest.id },
          });
          return {
            work_order_id: task.work_order_id,
            ok: result.status === "completed" || result.status === "success" || !!result.result,
            detail: String(result.result ?? result.status ?? "done").slice(0, 200),
          };
        } catch (err) {
          return {
            work_order_id: task.work_order_id,
            ok: false,
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );
    results.push(...batchResults);
  }

  const runMode: DispatchRunResult["mode"] = manifest.tasks.some((t) => t.mode === "cursor_cloud")
    ? "cursor_cloud"
    : "cursor_sdk";
  return { manifest, manifestPath, mode: runMode, results };
}

export function formatDispatchPlan(manifest: DispatchManifest): string {
  const lines = [
    `# Dispatch Plan · ${manifest.id}`,
    "",
    `**Tenant:** ${manifest.tenant}`,
    `**Tasks:** ${manifest.tasks.length}`,
    `**Parallel:** ${manifest.parallel}`,
    `**Cursor SDK:** ${manifest.cursor_sdk_available ? "yes" : "no (manifest only)"}`,
    "",
    "| work_order | agent | mode | prompt |",
    "|------------|-------|------|--------|",
    ...manifest.tasks.map(
      (t) => `| ${t.work_order_id} | ${t.agent} | ${t.mode} | ${t.prompt_relative ?? "—"} |`
    ),
    "",
  ];
  if (!manifest.cursor_sdk_available) {
    lines.push(
      "## Portable dispatch (no Cursor SDK)",
      "",
      "1. `orgos agent implement --id <IMP-...>` — LLM API / Aider / shell",
      "2. `orgos agent dispatch run --id <IMP-...>` — auto portable fallback",
      "3. Prompt MD includes full agent definition (tool-neutral)",
      "",
      "Optional Cursor: `npm install @cursor/sdk` + `CURSOR_API_KEY`",
      ""
    );
  }
  return lines.join("\n");
}
