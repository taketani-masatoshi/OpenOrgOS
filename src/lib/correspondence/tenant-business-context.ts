/**
 * L1 tenant business context for correspondence compose.
 *
 * This intentionally returns redacted summaries, not externally assertable
 * amount claims. Outbound amount disclosure remains controlled by claims.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir, getTenantDir, loadTenantConfig } from "../utils.js";
import type { KnowledgeHit } from "./knowledge-search.js";

const moduleSchema = z.object({
  id: z.string(),
  enabled: z.boolean().default(false),
  property_ids: z.array(z.string()).optional(),
});

const modulesFileSchema = z.object({
  modules: z.array(z.unknown()).default([]),
});

const propertySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  hotel: z
    .object({
      opened_date: z.string().optional(),
    })
    .optional(),
});

type TenantModule = z.output<typeof moduleSchema>;
type TenantProperty = z.output<typeof propertySchema>;

/** Catalog line-of-business ids (tenant-agnostic). Not a MAL-specific list. */
const PRIMARY_MODULES = new Set(["rental", "hospitality", "professional_services"]);
/** Enabled regulatory modules that must not be phrased as the firm's main business. */
const SECONDARY_MODULES = new Set(["jp_medical_device"]);

function readYaml(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return YAML.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

function loadModules(): TenantModule[] {
  const parsed = readYaml(join(getTenantDir(), "modules.yaml"));
  const result = modulesFileSchema.safeParse(parsed ?? {});
  if (!result.success) return [];
  return result.data.modules.flatMap((entry) => {
    const module = moduleSchema.safeParse(entry);
    return module.success ? [module.data] : [];
  });
}

function loadProperty(id: string): TenantProperty | undefined {
  const parsed = readYaml(join(getDataDir(), "properties", `${id}.yaml`));
  if (!parsed) return undefined;
  const result = propertySchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

/** Keep L1 excerpts free of yen / large integers so they cannot become unclaimed facts. */
function stripAmountTokens(text: string): string {
  return text
    .replace(/(?:¥|￥|\$)\s*[\d,]+/g, "")
    .replace(/\d{1,3}(?:,\d{3})+/g, "")
    .replace(/\d+\s*(?:円|万円|man)/gi, "")
    .replace(/\b\d{6,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function publicLocation(location?: string): string | undefined {
  if (!location) return undefined;
  const parts = location.split(/\s+/);
  return parts.slice(0, 2).join(" ");
}

function summarizeProperty(property: TenantProperty): string {
  const bits = [
    property.name ? `${property.name}（${property.id}）` : property.id,
    property.type ? `用途=${property.type}` : "",
    publicLocation(property.location) ? `所在地概略=${publicLocation(property.location)}` : "",
    property.hotel?.opened_date ? `開業日=${property.hotel.opened_date}` : "",
  ].filter(Boolean);
  return stripAmountTokens(bits.join(" · "));
}

function financeGuardExcerpt(): string {
  const financeFiles = ["fixed-assets.yaml", "loans.yaml"]
    .map((name) => join(getDataDir(), "finance", name))
    .filter(existsSync);
  if (!financeFiles.length) return "";
  return "固定資産・借入などの財務数値は社内判断用に正本があるが、対外メール本文では個別に検証済みclaimがない限り金額を記載しない。";
}

export function buildTenantBusinessKnowledgeHits(
  query: string,
  opts?: { limit?: number }
): KnowledgeHit[] {
  let tenant: ReturnType<typeof loadTenantConfig>;
  try {
    tenant = loadTenantConfig();
  } catch {
    return [];
  }
  const modules = loadModules();
  const enabled = modules.filter((m) => m.enabled);
  const primary = enabled.filter((m) => PRIMARY_MODULES.has(m.id));
  const secondary = enabled.filter((m) => SECONDARY_MODULES.has(m.id));
  const propertyIds = [...new Set(primary.flatMap((m) => m.property_ids ?? []))];
  const properties = propertyIds.map(loadProperty).filter((p): p is TenantProperty => Boolean(p));

  const hits: KnowledgeHit[] = [];
  hits.push({
    path: "tenant.yaml",
    title: "テナント事業概要",
    excerpt: stripAmountTokens(
      [
        `${tenant.legal_name ?? tenant.name} の事業概要: ${tenant.description ?? tenant.name}`,
        primary.length ? `主な有効事業: ${primary.map((m) => m.id).join(", ")}` : "",
        secondary.length
          ? `補助・規制対応モジュール: ${secondary.map((m) => m.id).join(", ")}。主事業として断定しない。`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    ),
    score: 4,
  });

  for (const property of properties) {
    hits.push({
      path: `data/properties/${property.id}.yaml`,
      title: property.name ?? property.id,
      excerpt: summarizeProperty(property),
      score: /物件|旅館|不動産|賃貸|hotel|rental|property/i.test(query) ? 4 : 2,
    });
  }

  const financeGuard = financeGuardExcerpt();
  if (financeGuard) {
    hits.push({
      path: "data/finance/",
      title: "財務数値の外部開示ガード",
      excerpt: financeGuard,
      score: /借入|土地|取得|金額|財務|loan|asset|finance/i.test(query) ? 4 : 1,
    });
  }

  return hits.slice(0, opts?.limit ?? 4);
}
