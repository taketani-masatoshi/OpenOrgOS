#!/usr/bin/env node
/**
 * Write blank pack templates for records.yaml files that have no tenant_path.
 * Does not overwrite existing templates. ISO-21401 is skipped when already complete.
 *
 *   node --import tsx scripts/write-iso-domain-templates.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listAvailableIsoIds } from "../src/lib/iso-catalog.js";
import { loadRecordSpecs } from "../src/lib/iso-records.js";
import { CORE_TEMPLATES_DIR, packTemplatesDir } from "../src/lib/iso-templates.js";

function extraColumns(spec: { rules: { kind: string; require?: string[] }[] }): string[] {
  const extra: string[] = [];
  for (const rule of spec.rules) {
    if (rule.kind === "conditional_required" && rule.require) extra.push(...rule.require);
  }
  return extra;
}

function csvTemplate(spec: {
  columns: { name: string }[];
  rules: { kind: string; require?: string[] }[];
}): string {
  const names = [...spec.columns.map((c) => c.name)];
  for (const name of extraColumns(spec)) {
    if (!names.includes(name)) names.push(name);
  }
  return `${names.join(",")}\n`;
}

function mdTemplate(spec: { title: string; rules: { kind: string; headings?: string[] }[] }): string {
  const headings = spec.rules.find((r) => r.kind === "required_sections")?.headings ?? [];
  const lines = [`# ${spec.title}`, "", `{SCOPE}`, ""];
  for (const h of headings) {
    lines.push(`## ${h}`, "", `{${h.replace(/\s+/g, "_").toUpperCase()}}`, "");
  }
  return lines.join("\n");
}

let created = 0;
for (const id of listAvailableIsoIds()) {
  const dir = packTemplatesDir(id);
  mkdirSync(dir, { recursive: true });
  for (const spec of loadRecordSpecs(id)?.records ?? []) {
    if (spec.tenant_path) continue;
    const pack = join(dir, spec.file);
    const core = join(CORE_TEMPLATES_DIR, spec.file);
    if (existsSync(pack) || existsSync(core)) continue;
    const body =
      spec.kind === "csv"
        ? csvTemplate(spec)
        : spec.kind === "markdown"
          ? mdTemplate(spec)
          : "entries: []\n";
    writeFileSync(pack, body, "utf-8");
    created += 1;
    console.log(`wrote ${id}/templates/${spec.file}`);
  }
}
console.log(`created ${created} templates`);
