import {
  damageIncidentSchema,
  damageIncidentsFileSchema,
  type DamageIncident,
} from "../../../../schemas/hospitality-ops.js";
import { getClock } from "../../../../src/lib/runtime-context.js";
import { resolveTenantPath } from "../../../../src/lib/tenant.js";
import { currentDate, readYamlFile, writeYamlFile } from "../../../../src/lib/utils.js";
import { defaultHospitalityPropertyId } from "./ops-lib.js";

export const DAMAGE_INCIDENTS_REL = "data/operations/damage-incidents.yaml";

function emptyFile() {
  return damageIncidentsFileSchema.parse({ version: 1, incidents: [] });
}

export function loadDamageIncidents() {
  const path = resolveTenantPath(DAMAGE_INCIDENTS_REL);
  try {
    return readYamlFile(path, damageIncidentsFileSchema);
  } catch {
    return emptyFile();
  }
}

export function saveDamageIncidents(file: ReturnType<typeof loadDamageIncidents>): void {
  writeYamlFile(resolveTenantPath(DAMAGE_INCIDENTS_REL), damageIncidentsFileSchema.parse(file));
}

function nextDamageId(): string {
  const file = loadDamageIncidents();
  const year = currentDate().slice(0, 4);
  let max = 0;
  for (const i of file.incidents) {
    if (i.id.startsWith(`DMG-${year}-`)) {
      const n = Number(i.id.slice(`DMG-${year}-`.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `DMG-${year}-${String(max + 1).padStart(3, "0")}`;
}

export function damageLog(input: {
  id?: string;
  stayId?: string;
  propertyId?: string;
  itemDescription: string;
  discoveredOn?: string;
  liability?: DamageIncident["liability"];
  estimatedJpy?: number;
}): DamageIncident {
  const file = loadDamageIncidents();
  const id = input.id ?? nextDamageId();
  const existing = file.incidents.find((i) => i.id === id);
  const incident = damageIncidentSchema.parse({
    ...existing,
    id,
    stay_id: input.stayId ?? existing?.stay_id,
    property_id: input.propertyId ?? existing?.property_id ?? defaultHospitalityPropertyId(),
    item_description: input.itemDescription,
    discovered_on: input.discoveredOn ?? existing?.discovered_on ?? currentDate(),
    liability: input.liability ?? existing?.liability ?? "unclear",
    estimated_jpy: input.estimatedJpy ?? existing?.estimated_jpy,
    claim_status: existing?.claim_status ?? "none",
    updated_at: getClock().nowIso(),
  });
  const incidents = existing
    ? file.incidents.map((i) => (i.id === id ? incident : i))
    : [...file.incidents, incident];
  saveDamageIncidents({ version: 1, incidents });
  return incident;
}

export function damageEvidence(id: string, refs: string[], driveFolderUrl?: string): DamageIncident {
  const file = loadDamageIncidents();
  const existing = file.incidents.find((i) => i.id === id);
  if (!existing) throw new Error(`damage incident not found: ${id}`);
  const incident = damageIncidentSchema.parse({
    ...existing,
    evidence_path_refs: [...new Set([...existing.evidence_path_refs, ...refs])],
    drive_folder_url: driveFolderUrl ?? existing.drive_folder_url,
    updated_at: getClock().nowIso(),
  });
  saveDamageIncidents({
    version: 1,
    incidents: file.incidents.map((i) => (i.id === id ? incident : i)),
  });
  return incident;
}

export function damageClaim(
  id: string,
  status: DamageIncident["claim_status"],
  insurancePolicyRef?: string
): DamageIncident {
  const file = loadDamageIncidents();
  const existing = file.incidents.find((i) => i.id === id);
  if (!existing) throw new Error(`damage incident not found: ${id}`);
  const incident = damageIncidentSchema.parse({
    ...existing,
    claim_status: status,
    insurance_policy_ref: insurancePolicyRef ?? existing.insurance_policy_ref,
    updated_at: getClock().nowIso(),
  });
  saveDamageIncidents({
    version: 1,
    incidents: file.incidents.map((i) => (i.id === id ? incident : i)),
  });
  return incident;
}

export function listDamageClaimsDue(): DamageIncident[] {
  return loadDamageIncidents().incidents.filter((i) =>
    ["preparing", "filed"].includes(i.claim_status)
  );
}
