/**
 * Derive guest-facing / legacy public YAML from hospitality SSOT.
 * Canonical: data/operations/kamezawa-public.yaml (max_guests)
 *            data/properties/PROP-002.yaml (hotel.opened_date)
 * Guest MD only replaces <!-- orgos:sync … --> marker blocks.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { facilityPublicSchema, type FacilityPublic } from "../../../../schemas/operations.js";
import { propertySchema } from "../../../../schemas/property.js";
import {
  getDataDir,
  getDocsDir,
  readYamlFile,
  writeTrackedFile,
  writeYamlFile,
} from "../../../../src/lib/utils.js";

const PUBLIC_REL = "data/operations/kamezawa-public.yaml";
const LEGACY_PUBLIC_REL = "data/hospitality/operations-public.yaml";
const PROP_REL = "data/properties/PROP-002.yaml";

const GUEST_FACING_REL = [
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/ハウスルール.md",
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/house-rules.md",
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/welcome-sheet.md",
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/宿泊約款・ハウスルール.md",
] as const;

export type SyncDerivedChange = {
  path: string;
  action: "write" | "skip" | "warn";
  detail: string;
};

export type SyncDerivedResult = {
  max_guests: number;
  opened_date: string | null;
  changes: SyncDerivedChange[];
  would_write: boolean;
};

const MARKER_RE =
  /<!--\s*orgos:sync\s+([a-z0-9_-]+)\s*-->([\s\S]*?)<!--\s*\/orgos:sync\s*-->/gi;

function loadFacilityPublic(): FacilityPublic {
  const path = join(getDataDir(), "operations", "kamezawa-public.yaml");
  return readYamlFile(path, facilityPublicSchema);
}

function loadOpenedDate(): string | null {
  const path = join(getDataDir(), "properties", "PROP-002.yaml");
  if (!existsSync(path)) return null;
  const prop = readYamlFile(path, propertySchema);
  return prop.hotel?.opened_date ?? null;
}

function markerBody(key: string, maxGuests: number): string {
  switch (key) {
    case "max_guests_ja":
      return `最大${maxGuests}名（未登録の追加宿泊者不可）`;
    case "max_guests_en":
      return `${maxGuests} (including children) — no unregistered overnight guests`;
    case "max_guests_welcome":
      return `**Max ${maxGuests} guests** | **定員${maxGuests}名**`;
    case "max_guests_clause_ja":
      return `定員${maxGuests}名`;
    default:
      return String(maxGuests);
  }
}

function applyMarkers(content: string, maxGuests: number): { next: string; replaced: string[] } {
  const replaced: string[] = [];
  const next = content.replace(MARKER_RE, (_full, key: string) => {
    replaced.push(key);
    const body = markerBody(key, maxGuests);
    return `<!-- orgos:sync ${key} -->${body}<!-- /orgos:sync -->`;
  });
  return { next, replaced };
}

function absFromRepoRel(rel: string): string {
  if (rel.startsWith("data/")) return join(getDataDir(), rel.slice("data/".length));
  if (rel.startsWith("docs/")) return join(getDocsDir(), rel.slice("docs/".length));
  return join(getDataDir(), "..", rel);
}

function yamlEqual(a: unknown, b: unknown): boolean {
  return YAML.stringify(a) === YAML.stringify(b);
}

export function runHospitalitySyncDerived(opts: {
  write?: boolean;
  dryRun?: boolean;
}): SyncDerivedResult {
  const write = Boolean(opts.write) && !opts.dryRun;
  const publicData = loadFacilityPublic();
  const opened = loadOpenedDate();
  const changes: SyncDerivedChange[] = [];

  // Dual-write legacy hospitality/operations-public.yaml
  const legacyPath = absFromRepoRel(LEGACY_PUBLIC_REL);
  const legacyExists = existsSync(legacyPath);
  let legacyCurrent: unknown = null;
  if (legacyExists) {
    try {
      legacyCurrent = YAML.parse(readFileSync(legacyPath, "utf-8"));
    } catch {
      legacyCurrent = null;
    }
  }
  const legacyPayload = {
    ...publicData,
    notes:
      publicData.notes?.includes("正本:")
        ? publicData.notes
        : `正本: ${PUBLIC_REL}\n${publicData.notes ?? ""}`.trim(),
  };
  if (!legacyExists || !yamlEqual(legacyCurrent, legacyPayload)) {
    if (write) {
      writeYamlFile(legacyPath, legacyPayload);
      changes.push({
        path: LEGACY_PUBLIC_REL,
        action: "write",
        detail: `synced max_guests=${publicData.max_guests} from ${PUBLIC_REL}`,
      });
    } else {
      changes.push({
        path: LEGACY_PUBLIC_REL,
        action: "write",
        detail: `would sync max_guests=${publicData.max_guests} from ${PUBLIC_REL}`,
      });
    }
  } else {
    changes.push({
      path: LEGACY_PUBLIC_REL,
      action: "skip",
      detail: "already in sync",
    });
  }

  for (const rel of GUEST_FACING_REL) {
    const abs = absFromRepoRel(rel);
    if (!existsSync(abs)) {
      changes.push({ path: rel, action: "warn", detail: "file missing" });
      continue;
    }
    const raw = readFileSync(abs, "utf-8");
    if (!MARKER_RE.test(raw)) {
      // reset lastIndex after global test
      MARKER_RE.lastIndex = 0;
      changes.push({
        path: rel,
        action: "warn",
        detail: "no <!-- orgos:sync … --> markers; not overwritten",
      });
      continue;
    }
    MARKER_RE.lastIndex = 0;
    const { next, replaced } = applyMarkers(raw, publicData.max_guests);
    if (next === raw) {
      changes.push({
        path: rel,
        action: "skip",
        detail: `markers ok (${replaced.join(", ") || "none"})`,
      });
      continue;
    }
    if (write) {
      writeTrackedFile(abs, next);
      changes.push({
        path: rel,
        action: "write",
        detail: `updated markers: ${replaced.join(", ")}`,
      });
    } else {
      changes.push({
        path: rel,
        action: "write",
        detail: `would update markers: ${replaced.join(", ")}`,
      });
    }
  }

  return {
    max_guests: publicData.max_guests,
    opened_date: opened,
    changes,
    would_write: write,
  };
}

export function formatSyncDerivedResult(result: SyncDerivedResult): string {
  const lines = [
    `# hospitality sync-derived`,
    "",
    `- max_guests: ${result.max_guests}`,
    `- opened_date: ${result.opened_date ?? "—"} (${PROP_REL})`,
    `- mode: ${result.would_write ? "write" : "dry-run"}`,
    "",
    "| path | action | detail |",
    "|------|--------|--------|",
  ];
  for (const c of result.changes) {
    lines.push(`| ${c.path} | ${c.action} | ${c.detail} |`);
  }
  return lines.join("\n") + "\n";
}
