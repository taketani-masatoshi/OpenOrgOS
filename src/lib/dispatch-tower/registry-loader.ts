import { join } from "node:path";
import {
  dispatchTowerRegistrySchema,
  type DispatchTowerRegistry,
} from "../../../schemas/dispatch-tower-registry.js";
import { getInstallRoot, resolveFrameworkFile } from "../orgos-paths.js";
import { loadRegistryFile } from "../utils.js";

let cached: DispatchTowerRegistry | undefined;

function emptyDispatchTowerRegistry(): DispatchTowerRegistry {
  return dispatchTowerRegistrySchema.parse({ version: "1" });
}

export function dispatchTowerRegistryPath(): string {
  return resolveFrameworkFile(
    join(getInstallRoot(), "steward", "core", "dispatch-tower", "registry.yaml"),
  );
}

export function loadDispatchTowerRegistry(): DispatchTowerRegistry {
  if (!cached) {
    cached = loadRegistryFile(
      dispatchTowerRegistryPath(),
      dispatchTowerRegistrySchema,
      emptyDispatchTowerRegistry,
    );
  }
  return cached;
}

export function resetDispatchTowerRegistryForTests(): void {
  cached = undefined;
}
