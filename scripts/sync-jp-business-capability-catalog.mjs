#!/usr/bin/env node
/**
 * Regenerate the JP business capability catalog derivatives from the YAML SSOT:
 *   - summary counts (agents · modules · skills by status)
 *   - business-capability-catalog.csv (flat mirror consumed by the web catalog)
 *
 * Usage: node scripts/sync-jp-business-capability-catalog.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "..");
const PACK_DIR = join(ROOT, "steward/jurisdiction-packs/JP");
const YAML_PATH = join(PACK_DIR, "business-capability-catalog.yaml");
const CSV_PATH = join(PACK_DIR, "business-capability-catalog.csv");

const YAML_HEADER = `# Japan Business Capability Catalog
# 正本: steward/jurisdiction-packs/JP/business-capability-catalog.yaml
# Web 連携: business-capability-catalog.csv（同一内容 · フラット）
# 実装スコープ外 — 要件洗い出し · ロードマップ用 DB
#
# status: implemented | partial | planned
# priority: P0 全法人必須 | P1 一般的 | P2 業種・規模依存 | P3 任意

`;

const CSV_COLUMNS = [
  "entity_type",
  "id",
  "name_ja",
  "name_en",
  "category_id",
  "status",
  "priority",
  "agent_id",
  "module_id",
  "runtime",
  "cli_command",
  "tier",
  "pack",
  "regulations",
  "official_urls",
  "notes",
  "path",
];

function countByStatus(rows) {
  const tally = { implemented: 0, partial: 0, planned: 0, total: rows.length };
  for (const row of rows) {
    if (row.status in tally) tally[row.status] += 1;
  }
  return tally;
}

function list(values) {
  return Array.isArray(values) ? values.join(";") : (values ?? "");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(fields) {
  return CSV_COLUMNS.map((column) => csvCell(fields[column])).join(",");
}

function buildCsv(doc) {
  const rows = [CSV_COLUMNS.join(",")];

  for (const category of doc.categories) {
    rows.push(
      csvRow({
        entity_type: "category",
        id: category.id,
        name_ja: category.name_ja,
        name_en: category.name_en,
        category_id: category.id,
      }),
    );
  }

  for (const agent of doc.agents) {
    rows.push(
      csvRow({
        entity_type: "agent",
        id: agent.id,
        name_ja: agent.name_ja,
        name_en: agent.name_en,
        category_id: list(agent.categories),
        status: agent.status,
        priority: agent.priority,
        module_id: list(agent.binds_modules),
        tier: agent.tier,
        notes: agent.notes,
        path: agent.path,
      }),
    );
  }

  for (const module of doc.modules) {
    rows.push(
      csvRow({
        entity_type: "module",
        id: module.id,
        name_ja: module.name_ja,
        category_id: list(module.categories),
        status: module.status,
        priority: module.priority,
        agent_id: module.agent_proxy,
        module_id: list(module.binds_modules),
        tier: module.tier,
        pack: module.pack,
        regulations: list(module.regulations),
        official_urls: list(module.official_urls),
        notes: module.notes,
      }),
    );
  }

  for (const skill of doc.skills) {
    rows.push(
      csvRow({
        entity_type: "skill",
        id: skill.id,
        name_ja: skill.name_ja,
        category_id: list(skill.categories),
        status: skill.status,
        priority: skill.priority,
        agent_id: skill.agent_id,
        module_id: skill.module_id,
        runtime: skill.runtime,
        cli_command: skill.cli_command,
        regulations: list(skill.regulations),
        notes: skill.notes,
      }),
    );
  }

  return `${rows.join("\n")}\n`;
}

const write = process.argv.includes("--write");
const doc = YAML.parse(readFileSync(YAML_PATH, "utf-8"));

doc.summary = {
  ...doc.summary,
  agents: countByStatus(doc.agents),
  modules: countByStatus(doc.modules),
  skills: countByStatus(doc.skills),
};

const nextYaml = YAML_HEADER + YAML.stringify(doc);
const nextCsv = buildCsv(doc);

if (!write) {
  const yamlDrift = nextYaml !== readFileSync(YAML_PATH, "utf-8");
  const csvDrift = nextCsv !== readFileSync(CSV_PATH, "utf-8");
  console.log(JSON.stringify(doc.summary, null, 2));
  console.log(`YAML drift: ${yamlDrift} · CSV drift: ${csvDrift}`);
  console.log("Dry run — pass --write to update files");
  process.exit(yamlDrift || csvDrift ? 1 : 0);
}

writeFileSync(YAML_PATH, nextYaml, "utf-8");
writeFileSync(CSV_PATH, nextCsv, "utf-8");
console.log(`✓ ${YAML_PATH}`);
console.log(`✓ ${CSV_PATH}`);
console.log(JSON.stringify(doc.summary, null, 2));
