import { existsSync } from "node:fs";
import { aiaRuntimeFileSchema, type AiaRuntimeFile } from "../../../schemas/aia-runtime.js";
import { tenantDataPath } from "../tenant.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

const DEFAULT_RUNTIME: AiaRuntimeFile = aiaRuntimeFileSchema.parse({
  schema: "orgos.aia.runtime.v1",
});

export function aiaRuntimeConfigPath(): string {
  return tenantDataPath("org", "aia-runtime.yaml");
}

export function loadAiaRuntimeConfig(): AiaRuntimeFile {
  const path = aiaRuntimeConfigPath();
  if (!existsSync(path)) return DEFAULT_RUNTIME;
  return readYamlFile(path, aiaRuntimeFileSchema);
}

export function saveAiaRuntimeConfig(config: AiaRuntimeFile): string {
  const path = aiaRuntimeConfigPath();
  writeYamlFile(path, config);
  return path;
}

export function persistAiaMetrics(scheduler: { metrics(): Record<string, number> }): void {
  const path = aiaRuntimeConfigPath();
  const config = loadAiaRuntimeConfig();
  const next = {
    ...config,
    metrics: {
      ...config.metrics,
      ...scheduler.metrics(),
    },
  };
  writeYamlFile(path, next);
}
