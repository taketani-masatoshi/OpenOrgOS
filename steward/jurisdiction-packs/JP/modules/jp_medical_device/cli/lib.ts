import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  medicalDeviceGvpCatalogFileSchema,
  medicalDeviceLedgerRegistryFileSchema,
  medicalDeviceLicenseRegistryFileSchema,
  medicalDeviceMasterFileSchema,
  medicalDeviceObligationsFileSchema,
  medicalDeviceQmsCatalogFileSchema,
  type MedicalDeviceBusinessRole,
} from "../../../../../../schemas/jp-medical-device.js";
import type { z } from "zod";
import { z as zod } from "zod";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";

export const MODULE_ID = "jp_medical_device";

const ROLE_LABELS: Record<MedicalDeviceBusinessRole, string> = {
  manufacturing: "製造業",
  mah: "製造販売業",
  distribution: "販売業",
};

const ledgerFileSchema = zod.object({
  version: zod.string().default("1"),
  entries: zod.array(zod.record(zod.unknown())).default([]),
});

function loadYaml<T>(rel: string, schema: z.ZodType<T>): { path: string; data: T } | null {
  const loaded = loadModuleDataFile(MODULE_ID, rel, schema);
  if (!loaded) return null;
  return { path: loaded.path, data: loaded.data };
}

function resolveTemplatePath(templateRel: string): string | null {
  const seedDir = getModuleSeedDir(MODULE_ID);
  const seedPath = join(seedDir, templateRel);
  if (existsSync(seedPath)) return seedPath;
  const dataDir = getModuleDataDir(MODULE_ID);
  const dataPath = join(dataDir, templateRel);
  if (existsSync(dataPath)) return dataPath;
  return null;
}

function loadCompanySnapshot() {
  const company = loadCompany();
  return {
    name: company.name,
    representative: company.representative ?? "（代表者名）",
    address: company.address,
    business_description: company.business_description,
  };
}

function loadDevicesSummary(): string {
  const master = loadYaml("device-master.yaml", medicalDeviceMasterFileSchema);
  if (!master?.data.devices.length) return "（device-master.yaml に製品を登録）";
  return master.data.devices.map((d) => `${d.name}（${d.class}類）`).join(" · ");
}

function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  out = out.replace(/\{\{company\.name\}\}/g, vars["company.name"] ?? "");
  out = out.replace(/\{\{company\.representative\}\}/g, vars["company.representative"] ?? "");
  out = out.replace(/\{\{device\.name\}\}/g, vars["device.name"] ?? "（製品名）");
  return out;
}

function buildTemplateVars(docNumber: string, deviceName?: string) {
  const snap = loadCompanySnapshot();
  const licenses = loadYaml("license-registry.yaml", medicalDeviceLicenseRegistryFileSchema);
  const roles = licenses?.data.licenses.map((l) => ROLE_LABELS[l.role]).join(" · ") ?? "製造 · 製造販売 · 販売";
  return {
    "company.name": snap.name,
    "company.representative": snap.representative,
    doc_number: docNumber,
    effective_date: currentDate(),
    business_roles: roles,
    device_scope: loadDevicesSummary(),
    "device.name": deviceName ?? loadDevicesSummary().split(" · ")[0] ?? "（製品名）",
  };
}

export function runJpMedicalDeviceValidate(): void {
  const errors: string[] = [];
  const obligations = loadYaml("obligations-catalog.yaml", medicalDeviceObligationsFileSchema);
  const qms = loadYaml("qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
  const gvp = loadYaml("gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
  const licenses = loadYaml("license-registry.yaml", medicalDeviceLicenseRegistryFileSchema);
  const ledgers = loadYaml("ledger-registry.yaml", medicalDeviceLedgerRegistryFileSchema);
  if (!obligations) errors.push("obligations-catalog.yaml missing");
  if (!qms) errors.push("qms-catalog.yaml missing");
  if (!gvp) errors.push("gvp-catalog.yaml missing");
  if (!licenses) errors.push("license-registry.yaml missing");
  if (!ledgers) errors.push("ledger-registry.yaml missing");
  if (qms) {
    for (const doc of qms.data.documents) {
      if (!resolveTemplatePath(doc.template)) {
        errors.push(`QMS ${doc.id}: template missing (${doc.template})`);
      }
    }
  }
  if (gvp) {
    for (const doc of gvp.data.documents) {
      if (!resolveTemplatePath(doc.template)) {
        errors.push(`GVP ${doc.id}: template missing (${doc.template})`);
      }
    }
  }
  if (ledgers) {
    for (const ledger of ledgers.data.ledgers) {
      const loaded = loadModuleDataFile(MODULE_ID, ledger.data_file, ledgerFileSchema);
      if (!loaded) errors.push(`ledger ${ledger.id}: data file missing (${ledger.data_file})`);
    }
  }
  if (errors.length) {
    console.error("✗ jp_medical_device:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("✓ jp_medical_device — medical device QMS/GVP data OK");
}

export function runJpMedicalDeviceShow(opts: { json?: boolean }): void {
  const jurisdiction = getResolvedJurisdiction();
  const obligations = loadYaml("obligations-catalog.yaml", medicalDeviceObligationsFileSchema);
  const qms = loadYaml("qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema);
  const gvp = loadYaml("gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema);
  const licenses = loadYaml("license-registry.yaml", medicalDeviceLicenseRegistryFileSchema);
  const summary = {
    jurisdiction: jurisdiction.code,
    roles: obligations?.data.roles.length ?? 0,
    obligations: obligations?.data.obligations.length ?? 0,
    qms_documents: qms?.data.documents.length ?? 0,
    gvp_documents: gvp?.data.documents.length ?? 0,
    licenses: licenses?.data.licenses.length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log("# jp_medical_device\n");
  console.log(`法域: ${summary.jurisdiction} · 業態 ${summary.roles} · 義務 ${summary.obligations}`);
  console.log(`QMS ${summary.qms_documents} · GVP ${summary.gvp_documents} · 許可 ${summary.licenses}\n`);
  console.log("```bash");
  console.log("npm run orgos -- operations medical-device obligations --role mah");
  console.log("npm run orgos -- operations medical-device qms draft --doc QMS-MAN-001 --write");
  console.log("npm run orgos -- operations medical-device gvp draft --doc GVP-001 --write");
  console.log("npm run orgos -- operations medical-device ledger status");
  console.log("```");
}

export function runJpMedicalDeviceObligations(opts: {
  role?: string;
  json?: boolean;
}): void {
  const obligations = loadYaml("obligations-catalog.yaml", medicalDeviceObligationsFileSchema);
  if (!obligations) {
    console.error("obligations-catalog.yaml missing — run modules activate jp_medical_device");
    process.exit(1);
  }
  const roleFilter = opts.role as MedicalDeviceBusinessRole | undefined;
  const roles = roleFilter
    ? obligations.data.roles.filter((r) => r.id === roleFilter)
    : obligations.data.roles;
  const obList = obligations.data.obligations.filter(
    (o) => !roleFilter || o.role_ids.includes(roleFilter)
  );
  if (opts.json) {
    console.log(JSON.stringify({ roles, obligations: obList }, null, 2));
    return;
  }
  console.log("# 医療機器 業態別義務\n");
  for (const r of roles) {
    console.log(`## ${ROLE_LABELS[r.id]} (${r.id})\n`);
    console.log(`- 法的根拠: ${r.legal_basis}`);
    console.log(`- 許可: ${r.permit_type}`);
    if (r.qms_basis) console.log(`- QMS: ${r.qms_basis}`);
    console.log(`- GVP: ${r.gvp_required ? "要" : "—"}`);
    console.log("");
  }
  console.log("## 義務一覧\n");
  for (const o of obList) {
    console.log(`- \`${o.id}\` · ${o.title} · [${o.category}] · ${o.role_ids.map((id) => ROLE_LABELS[id]).join("/")}`);
  }
}

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

export function runJpMedicalDeviceLedgerList(opts: { json?: boolean }): void {
  const ledgers = loadYaml("ledger-registry.yaml", medicalDeviceLedgerRegistryFileSchema);
  if (!ledgers) process.exit(1);
  if (opts.json) {
    console.log(JSON.stringify(ledgers.data, null, 2));
    return;
  }
  console.log("# 台帳一覧\n");
  for (const l of ledgers.data.ledgers) {
    console.log(`- \`${l.id}\` · ${l.title} · ${l.data_file} · 保管 ${l.retention_years ?? "?"}年`);
  }
}

export function runJpMedicalDeviceLedgerStatus(opts: { json?: boolean }): void {
  const ledgers = loadYaml("ledger-registry.yaml", medicalDeviceLedgerRegistryFileSchema);
  if (!ledgers) process.exit(1);
  const rows = ledgers.data.ledgers.map((l) => {
    const data = loadModuleDataFile(MODULE_ID, l.data_file, ledgerFileSchema);
    const entries = data?.data.entries ?? [];
    return {
      id: l.id,
      title: l.title,
      entries: entries.length,
      data_file: l.data_file,
    };
  });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log("# 台帳ステータス\n");
  console.log("| 台帳 | 件数 | ファイル |");
  console.log("|------|-----:|---------|");
  for (const r of rows) {
    console.log(`| ${r.title} | ${r.entries} | ${r.data_file} |`);
  }
}
