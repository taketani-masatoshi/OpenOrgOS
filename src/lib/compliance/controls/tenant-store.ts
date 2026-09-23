import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  tenantControlsFileSchema,
  type ControlMaturity,
  type TenantControlStatus,
} from "../../../../schemas/control-framework.js";
import { getClock } from "../../runtime-context.js";
import { getTenantDir } from "../../tenant.js";
import { readYamlFile, writeYamlFile } from "../../utils.js";
import { loadApplicableIsoIds } from "../standards/tenant.js";
import { loadControlMaps } from "./maps.js";

export const TENANT_CONTROLS_REL = "data/compliance/controls.yaml";

export function controlsFilePath(): string {
  return join(getTenantDir(), TENANT_CONTROLS_REL);
}

function loadTenantControlStatus(): Map<string, TenantControlStatus> {
  const path = controlsFilePath();
  if (!existsSync(path)) return new Map();
  const file = readYamlFile(path, tenantControlsFileSchema);
  return new Map(file.controls.map((control) => [control.id, control]));
}

export function initTenantControlsFile(opts: { dryRun?: boolean } = {}): {
  path: string;
  count: number;
} {
  const controls = loadControlMaps(loadApplicableIsoIds());
  const existing = loadTenantControlStatus();
  const entries: TenantControlStatus[] = controls.map(
    (control) =>
      existing.get(control.id) ?? {
        id: control.id,
        maturity: "L0" as ControlMaturity,
      }
  );
  const path = controlsFilePath();
  if (!opts.dryRun) {
    writeYamlFile(path, {
      version: "1",
      as_of: getClock().nowIso().slice(0, 10),
      controls: entries,
    });
  }
  return { path, count: entries.length };
}

export function setTenantControlMaturity(opts: {
  id: string;
  maturity: ControlMaturity;
  notes?: string;
}): void {
  const path = controlsFilePath();
  const file = existsSync(path)
    ? readYamlFile(path, tenantControlsFileSchema)
    : { version: "1", controls: [] as TenantControlStatus[] };
  const reviewedOn = getClock().nowIso().slice(0, 10);
  const entry: TenantControlStatus = {
    id: opts.id,
    maturity: opts.maturity,
    last_reviewed: reviewedOn,
    notes: opts.notes,
  };
  const index = file.controls.findIndex((control) => control.id === opts.id);
  if (index >= 0) file.controls[index] = { ...file.controls[index], ...entry };
  else file.controls.push(entry);
  file.as_of = reviewedOn;
  writeYamlFile(path, file);
}

export { loadTenantControlStatus };
