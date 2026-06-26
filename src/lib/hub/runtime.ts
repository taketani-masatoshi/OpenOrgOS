export interface HubRuntimeConfig {
  hubId: string;
  dataDir: string;
}

let runtime: HubRuntimeConfig | null = null;

export function configureHubRuntime(config: HubRuntimeConfig): void {
  runtime = config;
}

export function getHubRuntime(): HubRuntimeConfig {
  if (!runtime) {
    throw new Error("Hub runtime not configured — call configureHubRuntime() or hub serve first");
  }
  return runtime;
}

export function tryGetHubRuntime(): HubRuntimeConfig | null {
  return runtime;
}
