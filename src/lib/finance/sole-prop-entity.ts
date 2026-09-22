import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantId } from "../tenant.js";
import { getTenantsDir } from "../orgos-paths.js";

export function readTenantEntityForm(): string {
  try {
    const path = join(getTenantsDir(), getTenantId(), "tenant.yaml");
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf-8").match(/^entity_form:\s*(\S+)/m)?.[1] ?? "";
  } catch {
    return "";
  }
}

export function isSoleProprietorship(): boolean {
  return readTenantEntityForm() === "sole_proprietorship";
}
