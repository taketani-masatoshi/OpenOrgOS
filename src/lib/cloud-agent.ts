import { cloudAgentConfigSchema, type CloudAgentConfig } from "../../schemas/cloud-agent.js";
import { CLOUD_AGENT_CONFIG_PATH } from "./steward-paths.js";
import { loadRegistryFile } from "./utils.js";

export { CLOUD_AGENT_CONFIG_PATH };

export function loadCloudAgentConfig(): CloudAgentConfig {
  return loadRegistryFile(CLOUD_AGENT_CONFIG_PATH, cloudAgentConfigSchema, () =>
    cloudAgentConfigSchema.parse({ version: "1" })
  );
}

export function resolveDispatchRuntime(preferred?: "local" | "cloud" | "manifest"): "local" | "cloud" | "manifest" {
  if (preferred === "manifest") return "manifest";
  const cfg = loadCloudAgentConfig();
  if (preferred === "local" || preferred === "cloud") return preferred;
  if (cfg.runtime === "local") return "local";
  if (cfg.runtime === "cloud") return "cloud";
  // auto: cloud if repository + API key, else local if SDK, else manifest
  if (cfg.cloud?.repository && process.env.CURSOR_API_KEY?.trim()) return "cloud";
  return "local";
}

export function isCloudDispatchReady(): boolean {
  const cfg = loadCloudAgentConfig();
  return !!(cfg.cloud?.repository && process.env.CURSOR_API_KEY?.trim());
}

export function formatCloudConfig(): string {
  const cfg = loadCloudAgentConfig();
  return [
    "# Cloud Agent Config",
    "",
    `**Runtime:** ${cfg.runtime}`,
    `**Repository:** ${cfg.cloud?.repository ?? "(not set)"}`,
    `**Ref:** ${cfg.cloud?.ref ?? "main"}`,
    `**Model:** ${cfg.cloud?.model ?? "composer-2.5"}`,
    `**Watch interval:** ${cfg.watch?.interval_ms ?? 30000}ms`,
    `**CURSOR_API_KEY:** ${process.env.CURSOR_API_KEY ? "set" : "missing"}`,
    "",
  ].join("\n");
}
