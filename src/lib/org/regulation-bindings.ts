import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import {
  regulationBindingsManifestSchema,
  type RegulationBindingEntry,
  type RegulationBindingsManifest,
} from "../../../schemas/org/regulation-bindings.js";
import { createCompanyEvent } from "../company-events.js";
import { canonicalJson } from "../protocol/canonical.js";
import {
  getTenantDir,
  getTenantId,
  resolveTenantPath,
  tenantDataPath,
} from "../tenant.js";
import {
  hashCanonicalValue,
  hashTextFile,
  hashYamlFile,
  parseYamlFile,
} from "./content-fingerprint.js";
import { writeYamlFile } from "../utils.js";

let cachedTenant: string | undefined;
let cached: RegulationBindingsManifest | undefined;

export function regulationBindingsPath(): string {
  return tenantDataPath("org", "regulation-bindings.yaml");
}

export function clearRegulationBindingsCacheForTests(): void {
  cachedTenant = undefined;
  cached = undefined;
}

export function loadRegulationBindings():
  RegulationBindingsManifest | undefined {
  const tenantId = getTenantId();
  if (cached && cachedTenant === tenantId) return cached;
  const path = regulationBindingsPath();
  if (!existsSync(path)) {
    cachedTenant = tenantId;
    cached = undefined;
    return undefined;
  }
  cachedTenant = tenantId;
  cached = regulationBindingsManifestSchema.parse(
    YAML.parse(readFileSync(path, "utf-8")),
  );
  return cached;
}

export function saveRegulationBindings(
  manifest: RegulationBindingsManifest,
): string {
  const path = regulationBindingsPath();
  const parsed = regulationBindingsManifestSchema.parse(manifest);
  if (process.env.ORGOS_IDE_CERTIFY === "1") {
    cachedTenant = getTenantId();
    cached = parsed;
    return path;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeYamlFile(path, parsed);
  cachedTenant = getTenantId();
  cached = parsed;
  return path;
}

/** Resolve path: tenant-relative (data/... or docs/...). */
export function resolveBindingArtifactPath(relPath: string): string {
  const cleaned = relPath.replace(/^\.\//, "");
  const fromTenant = resolveTenantPath(cleaned);
  if (existsSync(fromTenant)) return fromTenant;
  const alt = join(getTenantDir(), cleaned);
  if (existsSync(alt)) return alt;
  return fromTenant;
}

type SubsetExtractor = (doc: unknown) => unknown;

export function canonicalOrgChartProjection(doc: unknown): unknown {
  const root = doc as {
    version?: unknown;
    nodes?: Array<Record<string, unknown>>;
  };
  const nodes = Array.isArray(root.nodes) ? root.nodes : [];
  return {
    version: root.version,
    nodes: nodes.map((node) => ({
      id: node.id,
      display_name: node.display_name,
      title: node.title,
      function: node.function,
      layer: node.layer,
      board_role: node.board_role,
      reports_to: node.reports_to ?? null,
      canvas_suites: node.canvas_suites ?? null,
    })),
  };
}

const SUBSET_EXTRACTORS: Record<string, SubsetExtractor> = {
  "operators.authority_projection": (doc) => {
    const root = doc as { operators?: Array<Record<string, unknown>> };
    const ops = Array.isArray(root.operators) ? root.operators : [];
    return ops.map((o) => ({
      operator_id: o.operator_id,
      role: o.role,
      status: o.status,
      org_unit_id: o.org_unit_id ?? null,
      allowed_agents: o.allowed_agents ?? null,
      permissions: o.permissions ?? null,
      data_path_globs: o.data_path_globs ?? null,
    }));
  },
  "governance_policy.profile": (doc) => {
    const root = doc as Record<string, unknown>;
    return {
      version: root.version,
      authority_profile: root.authority_profile,
      forbid_ceo_auditor_overlap: root.forbid_ceo_auditor_overlap ?? null,
    };
  },
  "org_chart.canonical_structure": canonicalOrgChartProjection,
};

export function listCanonicalSubsetIds(): string[] {
  return Object.keys(SUBSET_EXTRACTORS);
}

export function hashImplementation(entry: RegulationBindingEntry): string {
  const abs = resolveBindingArtifactPath(entry.implementation.path);
  const subsetId = entry.implementation.canonical_subset_id;
  if (!subsetId) return hashYamlFile(abs);
  const extractor = SUBSET_EXTRACTORS[subsetId];
  if (!extractor) {
    throw new Error(`Unknown canonical_subset_id "${subsetId}"`);
  }
  return hashCanonicalValue(extractor(parseYamlFile(abs)));
}

export function hashRegulation(entry: RegulationBindingEntry): string {
  const abs = resolveBindingArtifactPath(entry.regulation_ref.artifact_path);
  return hashTextFile(abs);
}

export function computeMapStructureHash(
  bindings: RegulationBindingEntry[],
): string {
  const structure = bindings.map((b) => ({
    binding_id: b.binding_id,
    regulation_ref: b.regulation_ref,
    implementation: b.implementation,
  }));
  return hashCanonicalValue(structure);
}

export function computeSetHash(manifest: RegulationBindingsManifest): string {
  const parts = {
    map_structure_hash: computeMapStructureHash(manifest.bindings),
    enacting_event_id: manifest.enacting_event_id ?? null,
    expected: manifest.bindings.map((b) => ({
      binding_id: b.binding_id,
      expected: b.expected ?? null,
    })),
  };
  return hashCanonicalValue(parts);
}

export interface BindingDrift {
  binding_id: string;
  field: "regulation" | "implementation" | "missing_expected";
  expected?: string;
  actual?: string;
  detail: string;
}

export interface BindingVerifyResult {
  ok: boolean;
  mode: RegulationBindingsManifest["mode"];
  enacting_event_id?: string;
  set_hash_ok: boolean;
  map_structure_hash_ok: boolean;
  drifts: BindingDrift[];
  measured: Array<{
    binding_id: string;
    regulation_hash: string;
    implementation_hash: string;
  }>;
}

export function verifyRegulationBindings(
  manifest = loadRegulationBindings(),
): BindingVerifyResult {
  if (!manifest || manifest.bindings.length === 0) {
    return {
      ok: true,
      mode: "advisory",
      set_hash_ok: true,
      map_structure_hash_ok: true,
      drifts: [],
      measured: [],
    };
  }

  const drifts: BindingDrift[] = [];
  const measured: BindingVerifyResult["measured"] = [];

  const structureHash = computeMapStructureHash(manifest.bindings);
  const map_structure_hash_ok =
    !manifest.map_structure_hash ||
    manifest.map_structure_hash === structureHash;
  if (!map_structure_hash_ok) {
    drifts.push({
      binding_id: "*",
      field: "missing_expected",
      detail:
        "map_structure_hash drift (manifest structure changed without freeze)",
      expected: manifest.map_structure_hash,
      actual: structureHash,
    });
  }

  for (const b of manifest.bindings) {
    let regHash = "";
    let implHash = "";
    try {
      regHash = hashRegulation(b);
      implHash = hashImplementation(b);
    } catch (err) {
      drifts.push({
        binding_id: b.binding_id,
        field: "missing_expected",
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    measured.push({
      binding_id: b.binding_id,
      regulation_hash: regHash,
      implementation_hash: implHash,
    });
    if (!b.expected) {
      drifts.push({
        binding_id: b.binding_id,
        field: "missing_expected",
        detail:
          "expected fingerprints not frozen — run governance bindings freeze",
      });
      continue;
    }
    if (b.expected.regulation_hash !== regHash) {
      drifts.push({
        binding_id: b.binding_id,
        field: "regulation",
        expected: b.expected.regulation_hash,
        actual: regHash,
        detail: `${b.regulation_ref.reg_id} artifact drift vs ${b.regulation_ref.artifact_path}`,
      });
    }
    if (b.expected.implementation_hash !== implHash) {
      drifts.push({
        binding_id: b.binding_id,
        field: "implementation",
        expected: b.expected.implementation_hash,
        actual: implHash,
        detail: `implementation drift vs ${b.implementation.path}`,
      });
    }
  }

  const setHash = computeSetHash({
    ...manifest,
    map_structure_hash: structureHash,
  });
  const set_hash_ok = !manifest.set_hash || manifest.set_hash === setHash;
  if (!set_hash_ok) {
    drifts.push({
      binding_id: "*",
      field: "missing_expected",
      detail: "set_hash drift — re-freeze after board enactment",
      expected: manifest.set_hash,
      actual: setHash,
    });
  }

  return {
    ok: drifts.length === 0,
    mode: manifest.mode,
    enacting_event_id: manifest.enacting_event_id,
    set_hash_ok,
    map_structure_hash_ok,
    drifts,
    measured,
  };
}

export function assertRegulationBindingsAllowExecution(context: string): void {
  if (process.env.ORGOS_REGULATION_BINDINGS === "0") return;
  const manifest = loadRegulationBindings();
  if (!manifest?.bindings.length) return;
  const result = verifyRegulationBindings(manifest);
  if (result.ok) return;
  if (manifest.mode !== "enforced") return;
  const summary = result.drifts
    .slice(0, 5)
    .map((d) => `${d.binding_id}:${d.field}`)
    .join(", ");
  throw new Error(
    `Regulation binding drift blocks "${context}" (mode=enforced): ${summary}. ` +
      `Fix Yaml/規程 alignment then: orgos governance bindings freeze — ADR 0022`,
  );
}

export interface FreezeBindingsOptions {
  mode?: RegulationBindingsManifest["mode"];
  enactingEventId?: string;
  createEvent?: boolean;
  asOf?: string;
  title?: string;
}

export function freezeRegulationBindings(opts: FreezeBindingsOptions = {}): {
  path: string;
  manifest: RegulationBindingsManifest;
  event_id?: string;
} {
  const existing = loadRegulationBindings();
  if (!existing?.bindings.length) {
    throw new Error("No regulation-bindings.yaml bindings to freeze");
  }

  let enacting = opts.enactingEventId ?? existing.enacting_event_id;
  if (opts.createEvent) {
    const event = createCompanyEvent({
      kind: "governance",
      title: opts.title ?? "Regulation bindings enacted (fingerprint set)",
      related: {
        regulation_id: existing.bindings[0]?.regulation_ref.reg_id,
      },
      notes: [
        "regulation.enacted fingerprint set",
        `bindings: ${existing.bindings.map((b) => b.binding_id).join(", ")}`,
        `set preview via orgos governance bindings verify`,
      ].join("\n"),
    });
    enacting = event.id;
  }

  const bindings = existing.bindings.map((b) => ({
    ...b,
    expected: {
      regulation_hash: hashRegulation(b),
      implementation_hash: hashImplementation(b),
    },
  }));

  const map_structure_hash = computeMapStructureHash(bindings);
  const draft: RegulationBindingsManifest = {
    ...existing,
    version: 1,
    as_of: opts.asOf ?? new Date().toISOString().slice(0, 10),
    mode: opts.mode ?? existing.mode ?? "enforced",
    enacting_event_id: enacting,
    map_structure_hash,
    bindings,
  };
  draft.set_hash = computeSetHash(draft);

  const path = saveRegulationBindings(draft);
  return { path, manifest: draft, event_id: enacting };
}

/** Exported for tests — structure hash uses canonicalJson stability. */
export function __testCanonicalJson(value: unknown): string {
  return canonicalJson(value);
}
