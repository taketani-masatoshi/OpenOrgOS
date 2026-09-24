import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  controlMapFileSchema,
  coreControlMapFileSchema,
  coreProfileFileSchema,
  type ControlDefinition,
  type CoreBinding,
  type IsoRef,
} from "../../../../schemas/control-framework.js";
import { JURISDICTION_PACKS_DIR } from "../../steward-paths.js";
import { readYamlFile } from "../../utils.js";
import { loadIsoCatalog } from "../iso/catalog.js";
import { packFilePath, STEWARD_ISO_DIR, STEWARD_STANDARDS_DIR } from "../packs/paths.js";
import { loadApplicableIsoIds } from "../standards/tenant.js";

export const CONTROL_FRAMEWORK_DIR = join(STEWARD_STANDARDS_DIR, "control-framework");
export const CORE_MS_DIR = join(STEWARD_ISO_DIR, "core");

export function getControlMapPath(standardId: string): string {
  return packFilePath(standardId, "control-map.yaml");
}

export function coreControlMapPath(): string {
  return join(CORE_MS_DIR, "control-map.yaml");
}

export function coreProfilesPath(): string {
  return join(CORE_MS_DIR, "profiles.yaml");
}

export function loadCoreControls() {
  const path = coreControlMapPath();
  if (!existsSync(path)) return [];
  return readYamlFile(path, coreControlMapFileSchema).controls;
}

export function loadCoreProfile(name: string): CoreBinding[] {
  const path = coreProfilesPath();
  if (!existsSync(path)) return [];
  return readYamlFile(path, coreProfileFileSchema).profiles[name] ?? [];
}

export function loadControlMapFile(standardId: string) {
  const path = getControlMapPath(standardId);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, controlMapFileSchema);
}

export function loadControlMapForStandard(standardId: string): ControlDefinition[] {
  return loadControlMapFile(standardId)?.controls ?? [];
}

export function loadCoreBindingsForStandard(standardId: string): CoreBinding[] {
  return loadControlMapFile(standardId)?.core_bindings ?? [];
}

function loadIsoEditions(): Map<string, string> {
  return new Map(loadIsoCatalog().standards.map((standard) => [standard.id, standard.year]));
}

export function synthesizeCoreControls(enabled: string[]): ControlDefinition[] {
  const editions = loadIsoEditions();
  const bindingsByWork = new Map<string, { standard: string; binding: CoreBinding }[]>();
  for (const standard of enabled) {
    for (const binding of loadCoreBindingsForStandard(standard)) {
      const bindings = bindingsByWork.get(binding.work) ?? [];
      bindings.push({ standard, binding });
      bindingsByWork.set(binding.work, bindings);
    }
  }

  return loadCoreControls().flatMap((control): ControlDefinition[] => {
    const bound = bindingsByWork.get(control.work);
    if (!bound?.length) return [];
    const iso_refs: IsoRef[] = bound.map(({ standard, binding }) => ({
      standard,
      clause: binding.clause,
      ...(editions.get(standard) ? { edition: editions.get(standard) } : {}),
      ...(binding.verified_on ? { verified_on: binding.verified_on } : {}),
      ...(binding.verified_by ? { verified_by: binding.verified_by } : {}),
    }));
    const evidence_paths = [
      ...new Set([
        ...control.evidence_paths,
        ...bound.flatMap(({ binding }) => binding.evidence_paths),
      ]),
    ];
    const regRefs = new Map<string, { reg_id: string; articles?: string[] }>();
    for (const ref of [...control.reg_refs, ...bound.flatMap(({ binding }) => binding.reg_refs)]) {
      const articles = [
        ...new Set([...(regRefs.get(ref.reg_id)?.articles ?? []), ...(ref.articles ?? [])]),
      ];
      regRefs.set(ref.reg_id, {
        reg_id: ref.reg_id,
        ...(articles.length ? { articles } : {}),
      });
    }
    const { work: _work, supersedes: _supersedes, guidance_refs: _guidance, ...rest } = control;
    return [{ ...rest, iso_refs, evidence_paths, reg_refs: [...regRefs.values()] }];
  });
}

export function loadControlMaps(enabledIsoIds?: string[]): ControlDefinition[] {
  const enabled = enabledIsoIds ?? loadApplicableIsoIds();
  const byId = new Map<string, ControlDefinition>(
    synthesizeCoreControls(enabled).map((control) => [control.id, control])
  );
  const editions = loadIsoEditions();
  for (const standard of enabled) {
    for (const control of loadControlMapForStandard(standard)) {
      byId.set(control.id, {
        ...control,
        iso_refs: control.iso_refs.map((ref) => ({
          ...ref,
          ...((ref.edition ?? editions.get(ref.standard))
            ? { edition: ref.edition ?? editions.get(ref.standard) }
            : {}),
        })),
      });
    }
  }
  return [...byId.values()];
}

export function getRegBindingsAbsPath(jurisdictionCode: string): string {
  return join(JURISDICTION_PACKS_DIR, jurisdictionCode, "control-framework", "reg-bindings.yaml");
}
