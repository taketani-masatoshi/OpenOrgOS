import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  etaxSpecManifestSchema,
  type EtaxSpecArtifact,
  type EtaxSpecManifest,
} from "../../../schemas/etax/spec-registry.js";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_BASELINE_SPEC_VERSION, ETAX_SPEC_RELATIVE_DIR } from "./constants.js";
import { etaxError } from "../../../schemas/etax/errors.js";

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

export function ksk2SpecRegistered(): boolean {
  const artifacts = listEtaxSpecArtifacts();
  if (artifacts.length === 0) return false;
  return artifacts.every((row) => row.sha256 !== null && row.status !== "SPEC_BLOCKED");
}

export function currentEtaxSpecVersion(): string {
  return loadEtaxSpecManifest().baseline.label || ETAX_BASELINE_SPEC_VERSION;
}

export function specStatusReport(): {
  family: "ksk2";
  baseline: EtaxSpecManifest["baseline"];
  ksk2Registered: boolean;
  artifacts: Array<{
    id: string;
    title: string;
    publishedOn: string;
    sha256: string | null;
    status: EtaxSpecArtifact["status"];
    codeChangeRequired: boolean;
  }>;
} {
  const manifest = loadEtaxSpecManifest();
  return {
    family: "ksk2",
    baseline: manifest.baseline,
    ksk2Registered: ksk2SpecRegistered(),
    artifacts: manifest.artifacts.map((row) => ({
      id: row.id,
      title: row.title,
      publishedOn: row.publishedOn,
      sha256: row.sha256,
      status: row.status,
      codeChangeRequired: row.codeChangeRequired,
    })),
  };
}
