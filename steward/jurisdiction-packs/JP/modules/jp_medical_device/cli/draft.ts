import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  medicalDeviceGvpCatalogFileSchema,
  medicalDeviceQmsCatalogFileSchema,
} from "../../../../../../schemas/jp-medical-device.js";
import { recordDocumentControlRevision } from "../../../../../../src/lib/medical-device/ledger-ops.js";
import { getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import {
  buildTemplateVars,
  fillTemplate,
  loadYaml,
  resolveTemplatePath,
} from "./shared.js";

export function runJpMedicalDeviceQmsCatalog(opts: { tier?: string; json?: boolean }): void {
  const qms = loadYaml("qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
  if (!qms) {
    console.error("qms-catalog.yaml missing");
    process.exit(1);
  }
  const docs = opts.tier
    ? qms.data.documents.filter((d) => d.tier === opts.tier)
    : qms.data.documents;
  if (opts.json) {
    console.log(JSON.stringify({ hierarchy: qms.data.hierarchy, documents: docs }, null, 2));
    return;
  }
  console.log("# QMS 文書カタログ\n");
  for (const h of qms.data.hierarchy) {
    console.log(`- 第${h.tier}階層: ${h.label}`);
  }
  console.log("");
  for (const d of docs) {
    console.log(`- \`${d.id}\` · 第${d.tier}階層 · ${d.title} · ${d.doc_number ?? ""}`);
  }
}

export function runJpMedicalDeviceGvpCatalog(opts: { json?: boolean }): void {
  const gvp = loadYaml("gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
  if (!gvp) {
    console.error("gvp-catalog.yaml missing");
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(gvp.data, null, 2));
    return;
  }
  console.log("# GVP 文書カタログ\n");
  for (const d of gvp.data.documents) {
    console.log(`- \`${d.id}\` · ${d.title} · ${d.gvp_chapter ?? ""}`);
  }
}

function draftDocument(
  catalog: "qms" | "gvp",
  docId: string,
  write: boolean
): { path: string; content: string } | null {
  const qms = loadYaml("qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
  const gvp = loadYaml("gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
  const entry =
    catalog === "qms"
      ? qms?.data.documents.find((d) => d.id === docId)
      : gvp?.data.documents.find((d) => d.id === docId);
  if (!entry) {
    console.error(`Unknown document: ${docId}`);
    process.exit(1);
  }
  const templatePath = resolveTemplatePath(entry.template);
  if (!templatePath) {
    console.error(`Template missing: ${entry.template}`);
    process.exit(1);
  }
  const raw = readFileSync(templatePath, "utf-8");
  const vars = buildTemplateVars(entry.doc_number ?? entry.id);
  const content = fillTemplate(raw, vars);
  const subdir = catalog === "qms" ? "qms" : "gvp";
  const fileName = `${entry.id.toLowerCase()}-${entry.title.replace(/[^\w\u3040-\u30ff\u4e00-\u9faf]+/g, "-").slice(0, 40)}.md`;
  const outPath = join(getDocsDir(), "medical-device", subdir, fileName);
  if (write) {
    writeTrackedFile(outPath, content);
    console.log(`Wrote ${outPath}`);
    try {
      recordDocumentControlRevision({
        docId: entry.id,
        title: entry.title,
        path: outPath,
      });
    } catch (err) {
      console.error(`document_control: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { path: outPath, content };
}

export function runJpMedicalDeviceQmsDraft(opts: {
  doc: string;
  all?: boolean;
  write?: boolean;
  json?: boolean;
}): void {
  const qms = loadYaml("qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
  if (!qms) process.exit(1);
  const ids = opts.all ? qms.data.documents.map((d) => d.id) : [opts.doc];
  const results = ids.map((id) => draftDocument("qms", id, !!opts.write));
  if (opts.json) {
    console.log(JSON.stringify(results?.map((r) => ({ path: r?.path })), null, 2));
    return;
  }
  if (!opts.write) {
    console.log(results[0]?.content ?? "");
    console.log("\n---\n`--write` で docs/medical-device/qms/ に保存");
  }
}

export function runJpMedicalDeviceGvpDraft(opts: {
  doc: string;
  all?: boolean;
  write?: boolean;
  json?: boolean;
}): void {
  const gvp = loadYaml("gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
  if (!gvp) process.exit(1);
  const ids = opts.all ? gvp.data.documents.map((d) => d.id) : [opts.doc];
  const results = ids.map((id) => draftDocument("gvp", id, !!opts.write));
  if (opts.json) {
    console.log(JSON.stringify(results?.map((r) => ({ path: r?.path })), null, 2));
    return;
  }
  if (!opts.write) {
    console.log(results[0]?.content ?? "");
    console.log("\n---\n`--write` で docs/medical-device/gvp/ に保存");
  }
}

