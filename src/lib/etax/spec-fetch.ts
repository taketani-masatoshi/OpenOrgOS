import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { etaxError } from "../../../schemas/etax/errors.js";
import type { EtaxSpecArtifact } from "../../../schemas/etax/spec-registry.js";
import { unpackMicrosoftCab } from "./cab-unpack.js";
import { sha256Hex } from "./hash.js";
import {
  etaxUnpackedDir,
  etaxVendorCabPath,
  etaxVendorDir,
  officialXsdRoot,
  vendorCabPresent,
} from "./spec-paths.js";
import { etaxSpecManifestPath, loadEtaxSpecManifest } from "./spec-registry.js";

const PHASE2_DEFAULT_IDS = [
  "e-tax01",
  "e-tax03",
  "e-tax04",
  "e-tax05",
  "e-tax07",
  "e-tax08",
  "e-tax10",
  "e-tax18",
  "e-tax19",
] as const;

/** Default `orgos etax spec fetch` ids. Must cover ETAX_REQUIRED_SPEC_ARTIFACT_IDS. */
export function defaultEtaxSpecFetchIds(): readonly string[] {
  return PHASE2_DEFAULT_IDS;
}

export function resolveOfficialXsd(relativePath: string): string {
  const dest = join(officialXsdRoot(), relativePath);
  if (!existsSync(dest)) {
    throw etaxError({
      code: "ETAX_OFFICIAL_XSD_MISSING",
      blocked: "SPEC_BLOCKED",
      rule: "ksk2-xsd",
      message: `Official XSD not unpacked: ${relativePath}`,
    });
  }
  return dest;
}

export async function fetchEtaxSpecArtifact(artifact: EtaxSpecArtifact): Promise<{
  path: string;
  sha256: string;
  bytes: number;
}> {
  mkdirSync(etaxVendorDir(), { recursive: true });
  const dest = etaxVendorCabPath(artifact.id);
  const res = await fetch(artifact.source, {
    headers: { "User-Agent": "OpenOrgOS-jp_etax-spec-fetch/1" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw etaxError({
      code: "ETAX_SPEC_FETCH_FAILED",
      blocked: "SPEC_BLOCKED",
      message: `Failed to retrieve ${artifact.id}: HTTP ${res.status}`,
    });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return { path: dest, sha256: sha256Hex(buf), bytes: buf.length };
}

export function hashLocalVendorCab(id: string): { sha256: string; bytes: number } {
  const path = etaxVendorCabPath(id);
  if (!existsSync(path)) {
    throw etaxError({
      code: "ETAX_SPEC_CAB_MISSING",
      blocked: "SPEC_BLOCKED",
      message: `Vendor CAB not present: ${path}`,
    });
  }
  const buf = readFileSync(path);
  return { sha256: sha256Hex(buf), bytes: buf.length };
}

export function unpackEtaxSpecArtifact(id: string): { dest: string; fileCount: number } {
  const cab = etaxVendorCabPath(id);
  if (!existsSync(cab)) {
    throw etaxError({
      code: "ETAX_SPEC_CAB_MISSING",
      blocked: "SPEC_BLOCKED",
      message: `Cannot unpack missing CAB ${id}`,
    });
  }
  const dest = etaxUnpackedDir(id);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const result = unpackMicrosoftCab(cab, dest);
  if (id === "e-tax19") {
    writeXsdCatalog(dest);
  }
  return { dest, fileCount: result.fileCount };
}

function writeXsdCatalog(root: string): void {
  const files: Array<{
    relativePath: string;
    sha256: string;
    bytes: number;
    targetNamespace: string | null;
  }> = [];
  const walk = (current: string, rel: string): void => {
    for (const ent of readdirSync(current, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${ent.name}` : ent.name;
      const p = join(current, ent.name);
      if (ent.isDirectory()) {
        walk(p, nextRel);
        continue;
      }
      if (!ent.name.toLowerCase().endsWith(".xsd")) continue;
      const buf = readFileSync(p);
      const text = buf.subarray(0, 2048).toString("utf8");
      const ns = text.match(/targetNamespace="([^"]+)"/)?.[1] ?? null;
      files.push({
        relativePath: nextRel,
        sha256: sha256Hex(buf),
        bytes: buf.length,
        targetNamespace: ns,
      });
    }
  };
  walk(root, "");
  writeFileSync(
    join(root, "xsd-catalog.json"),
    `${JSON.stringify({ generated_from: "e-tax19", count: files.length, files }, null, 2)}\n`,
    "utf-8"
  );
}

export function persistSpecManifestHashes(
  updates: Array<{
    id: string;
    sha256: string;
    bytes: number;
    unpackedFileCount?: number;
    refreshed?: boolean;
  }>,
  retrievedAt: string
): void {
  const manifest = loadEtaxSpecManifest();
  const next = {
    ...manifest,
    artifacts: manifest.artifacts.map((row) => {
      const hit = updates.find((item) => item.id === row.id);
      if (!hit) return row;
      return {
        ...row,
        sha256: hit.sha256,
        retrievedAt: hit.refreshed || !row.retrievedAt ? retrievedAt : row.retrievedAt,
        retrievedBytes: hit.bytes,
        unpackedFileCount: hit.unpackedFileCount ?? row.unpackedFileCount,
        status: "retrieved" as const,
      };
    }),
  };
  writeFileSync(etaxSpecManifestPath(), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

export async function fetchAndUnpackEtaxSpecs(opts: {
  ids?: string[];
  fetchRemote?: boolean;
  force?: boolean;
  unpack?: boolean;
  retrievedAt?: string;
}): Promise<{
  ids: string[];
  artifacts: Array<{
    id: string;
    sha256: string;
    bytes: number;
    unpackedFileCount?: number;
  }>;
}> {
  const ids = opts.ids?.length ? opts.ids : [...PHASE2_DEFAULT_IDS];
  const manifest = loadEtaxSpecManifest();
  const retrievedAt = opts.retrievedAt ?? new Date().toISOString();
  const artifacts: Array<{
    id: string;
    sha256: string;
    bytes: number;
    unpackedFileCount?: number;
    refreshed?: boolean;
  }> = [];
  for (const id of ids) {
    const listed = manifest.artifacts.find((row) => row.id === id);
    if (!listed) {
      throw etaxError({
        code: "ETAX_SPEC_ARTIFACT_UNKNOWN",
        blocked: "SPEC_BLOCKED",
        message: `Artifact ${id} is not in the KSK2 manifest`,
      });
    }
    let refreshed = false;
    if (opts.fetchRemote !== false && (opts.force || !vendorCabPresent(id))) {
      await fetchEtaxSpecArtifact(listed);
      refreshed = true;
    }
    const hashed = hashLocalVendorCab(id);
    let unpackedFileCount: number | undefined;
    if (opts.unpack !== false) {
      unpackedFileCount = unpackEtaxSpecArtifact(id).fileCount;
    }
    artifacts.push({ id, ...hashed, unpackedFileCount, refreshed });
  }
  persistSpecManifestHashes(artifacts, retrievedAt);
  return { ids, artifacts };
}

export function vendorCabBytes(id: string): number | null {
  const path = etaxVendorCabPath(id);
  if (!existsSync(path)) return null;
  return statSync(path).size;
}
