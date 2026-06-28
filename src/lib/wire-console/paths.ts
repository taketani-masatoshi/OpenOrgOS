import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../tenant.js";

export const WIRE_CONSOLE_DEFAULT_PORT = 9470;
export const ORGOS_STATE_DIR = join(ROOT_DIR, ".orgos");
export const WIRE_CONSOLE_MANIFEST_PATH = join(ORGOS_STATE_DIR, "wire-console.json");
export const WIRE_CONSOLE_SPA_DIST = join(ROOT_DIR, "apps", "wire-console", "dist");

export function ensureOrgOsStateDir(): void {
  if (!existsSync(ORGOS_STATE_DIR)) {
    mkdirSync(ORGOS_STATE_DIR, { recursive: true });
  }
}
