import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  etaxSpecManifestSchema,
  type EtaxSpecArtifact,
  type EtaxSpecManifest,
} from "../../../schemas/etax/spec-registry.js";
import { getInstallRoot } from "../orgos-paths.js";
import {
  ETAX_BASELINE_SPEC_VERSION,
  ETAX_REQUIRED_SPEC_ARTIFACT_IDS,
  ETAX_SPEC_RELATIVE_DIR,
} from "./constants.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { officialXsdAvailable, etaxVendorCabPath } from "./spec-paths.js";
import { sha256Hex } from "./hash.js";

export function etaxSpecDir(): string {
  return join(getInstallRoot(), ETAX_SPEC_RELATIVE_DIR);
}

export function etaxSpecManifestPath(): string {
  return join(etaxSpecDir(), "manifest.json");
}

export function loadEtaxSpecManifest(): EtaxSpecManifest {
  const path = etaxSpecManifestPath();
  if (!existsSync(path)) {
    throw etaxError({
      code: "ETAX_SPEC_MANIFEST_MISSING",
      blocked: "SPEC_BLOCKED",
      message: `KSK2 spec manifest not found: ${path}`,
    });
  }
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return etaxSpecManifestSchema.parse(raw);
}

export function listEtaxSpecArtifacts(): EtaxSpecArtifact[] {
  return loadEtaxSpecManifest().artifacts;
}

export function findEtaxSpecArtifact(id: string): EtaxSpecArtifact | undefined {
  return listEtaxSpecArtifacts().find((row) => row.id === id);
}

export type SpecArtifactDiskCheck = {
  id: string;
  required: boolean;
  manifestSha256: string | null;
  diskSha256: string | null;
  match: boolean;
};

/**
 * Required KSK2 CABs present on disk with SHA matching the manifest.
 * Optional listed packs (e-taxall, income tax, …) do not block registration.
 */
export function ksk2SpecRegistered(): boolean {
  return requiredSpecDiskChecks().every((row) => row.match);
}

export function requiredSpecDiskChecks(): SpecArtifactDiskCheck[] {
  const artifacts = listEtaxSpecArtifacts();
  const byId = new Map(artifacts.map((row) => [row.id, row]));
  return ETAX_REQUIRED_SPEC_ARTIFACT_IDS.map((id) => {
    const row = byId.get(id);
    const manifestSha256 = row?.sha256 ?? null;
    const cab = etaxVendorCabPath(id);
    let diskSha256: string | null = null;
    if (existsSync(cab)) {
      diskSha256 = sha256Hex(readFileSync(cab));
    }
    const match =
      manifestSha256 !== null &&
      diskSha256 !== null &&
      diskSha256 === manifestSha256 &&
      row !== undefined &&
      (row.status === "retrieved" || row.status === "sha_recorded");
    return {
      id,
      required: true,
      manifestSha256,
      diskSha256,
      match,
    };
  });
}

export function currentEtaxSpecVersion(): string {
  return loadEtaxSpecManifest().baseline.label || ETAX_BASELINE_SPEC_VERSION;
}

export function specStatusReport(): {
  family: "ksk2";
  baseline: EtaxSpecManifest["baseline"];
  ksk2Registered: boolean;
  officialXsdUnpacked: boolean;
  requiredChecks: SpecArtifactDiskCheck[];
  artifacts: Array<{
    id: string;
    title: string;
    publishedOn: string;
    sha256: string | null;
    status: EtaxSpecArtifact["status"];
    unpackedFileCount?: number;
    codeChangeRequired: boolean;
    required: boolean;
  }>;
} {
  const manifest = loadEtaxSpecManifest();
  const required = new Set<string>(ETAX_REQUIRED_SPEC_ARTIFACT_IDS);
  const requiredChecks = requiredSpecDiskChecks();
  return {
    family: "ksk2",
    baseline: manifest.baseline,
    ksk2Registered: ksk2SpecRegistered(),
    officialXsdUnpacked: officialXsdAvailable(),
    requiredChecks,
    artifacts: manifest.artifacts.map((row) => ({
      id: row.id,
      title: row.title,
      publishedOn: row.publishedOn,
      sha256: row.sha256,
      status: row.status,
      unpackedFileCount: row.unpackedFileCount,
      codeChangeRequired: row.codeChangeRequired,
      required: required.has(row.id),
    })),
  };
}
