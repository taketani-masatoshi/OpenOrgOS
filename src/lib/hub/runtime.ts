import { AsyncLocalStorage } from "node:async_hooks";

export interface HubRuntimeConfig {
  hubId: string;
  dataDir: string;
}

const hubRuntimeStorage = new AsyncLocalStorage<HubRuntimeConfig>();

/** Process-wide default for CLI, tests, and background workers without ALS context */
let defaultRuntime: HubRuntimeConfig | null = null;

export function configureHubRuntime(config: HubRuntimeConfig): void {
  defaultRuntime = config;
}

export function runWithHubRuntime<T>(config: HubRuntimeConfig, fn: () => T): T {
  return hubRuntimeStorage.run(config, fn);
}

export async function runWithHubRuntimeAsync<T>(
  config: HubRuntimeConfig,
  fn: () => Promise<T>
): Promise<T> {
  return hubRuntimeStorage.run(config, fn);
}

export function getHubRuntime(): HubRuntimeConfig {
  const store = hubRuntimeStorage.getStore() ?? defaultRuntime;
  if (!store) {
    throw new Error("Hub runtime not configured — call configureHubRuntime() or hub serve first");
  }
  return store;
}

export function tryGetHubRuntime(): HubRuntimeConfig | null {
  return hubRuntimeStorage.getStore() ?? defaultRuntime;
}
