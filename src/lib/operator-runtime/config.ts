import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  operatorRuntimeConfigSchema,
  type OperatorRuntimeConfig,
  type ResolvedShellCommand,
  type ShellCommandContext,
  type ShellProfile,
} from "../../../schemas/operator-runtime.js";
import { OPERATOR_RUNTIME_CONFIG_PATH } from "../steward-paths.js";
import { loadRegistryFile } from "../utils.js";
import { ROOT_DIR } from "../tenant.js";

export { OPERATOR_RUNTIME_CONFIG_PATH };

function isCursorSdkAvailable(): boolean {
  if (!process.env.CURSOR_API_KEY?.trim()) return false;
  try {
    const pkgPath = join(ROOT_DIR, "node_modules", "@cursor", "sdk", "package.json");
    return existsSync(pkgPath);
  } catch {
    return false;
  }
}

export function loadOperatorRuntimeConfig(): OperatorRuntimeConfig {
  return loadRegistryFile(OPERATOR_RUNTIME_CONFIG_PATH, operatorRuntimeConfigSchema, () =>
    operatorRuntimeConfigSchema.parse({ version: "1" })
  );
}

function substitute(template: string, ctx: ShellCommandContext): string {
  return template
    .replaceAll("{prompt}", ctx.promptPath)
    .replaceAll("{workspace}", ctx.workspace)
    .replaceAll("{tenant}", ctx.tenant);
}

function expandProfile(profile: ShellProfile, ctx: ShellCommandContext): ResolvedShellCommand {
  const command = profile.command.map((part) => substitute(part, ctx));
  return {
    command,
    cwd: substitute(profile.cwd ?? ctx.workspace, ctx),
    env: Object.fromEntries(
      Object.entries(profile.env ?? {}).map(([k, v]) => [k, substitute(v, ctx)])
    ),
    timeoutMs: profile.timeout_ms ?? 600_000,
  };
}

export function buildShellCommand(
  ctx: ShellCommandContext,
  profileName?: string
): ResolvedShellCommand | null {
  const cfg = loadOperatorRuntimeConfig();
  const profile =
    (profileName && cfg.profiles?.[profileName]) ??
    cfg.shell ??
    cfg.profiles?.aider;
  if (!profile?.command?.length) return null;
  return expandProfile(profile, ctx);
}

export type DispatchRuntimePreference =
  | "shell"
  | "cursor"
  | "local"
  | "cloud"
  | "manifest"
  | "auto";

export function resolveOperatorRuntime(
  preferred?: DispatchRuntimePreference
): "shell" | "cursor_sdk" | "cursor_cloud" | "manifest" {
  const cfg = loadOperatorRuntimeConfig();

  if (preferred === "manifest") return "manifest";
  if (preferred === "shell") {
    if (buildShellCommand({ promptPath: "/tmp/x", workspace: process.cwd(), tenant: "x" })) {
      return "shell";
    }
    return cfg.fallback_runtime === "manifest" ? "manifest" : "shell";
  }
  if (preferred === "cursor" || preferred === "local" || preferred === "cloud") {
    if (preferred === "cloud") return isCursorSdkAvailable() ? "cursor_cloud" : "manifest";
    if (isCursorSdkAvailable() && cfg.cursor?.enabled !== false) return "cursor_sdk";
    if (preferred === "local" || preferred === "cursor") return "manifest";
  }

  // auto
  if (cfg.default_runtime === "shell") {
    const shell = buildShellCommand({ promptPath: "/tmp/x", workspace: process.cwd(), tenant: "x" });
    if (shell) return "shell";
  }
  if (cfg.default_runtime === "cursor" && isCursorSdkAvailable() && cfg.cursor?.enabled !== false) {
    return "cursor_sdk";
  }
  if (isCursorSdkAvailable() && cfg.cursor?.enabled !== false) return "cursor_sdk";
  return cfg.fallback_runtime === "manifest" ? "manifest" : "shell";
}

export function formatOperatorRuntimeConfig(): string {
  const cfg = loadOperatorRuntimeConfig();
  const lines = [
    "# Operator Runtime Config",
    "",
    `**Default:** ${cfg.default_runtime}`,
    `**Fallback:** ${cfg.fallback_runtime}`,
    `**Shell command:** ${cfg.shell?.command?.join(" ") ?? "(not set)"}`,
    `**Profiles:** ${Object.keys(cfg.profiles ?? {}).join(", ") || "(none)"}`,
    `**Cursor enabled:** ${cfg.cursor?.enabled !== false ? "yes" : "no"}`,
    "",
  ];
  return lines.join("\n");
}
