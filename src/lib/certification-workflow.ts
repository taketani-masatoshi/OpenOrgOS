/**
 * Certification Fulfilment ワークフロー — 取得・更新・証跡・ゲート入力。
 * ADR 0012 · 状態 SSOT: data/certifications/certification-registry.yaml
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import YAML from "yaml";
import {
  certificationRegistryFileSchema,
  certificationTypesCatalogSchema,
  type CertificationInstance,
} from "../../schemas/jp-certification.js";
import { createCompanyEvent } from "./company-events.js";
import { getModuleDataDir } from "./module-business-data.js";
import { getModuleSeedDir } from "./modules.js";
import { currentDate, getDocsDir, resolveTenantPath, writeYamlFile } from "./utils.js";

const MODULE_ID = "jp_certification";

function loadYaml<T>(path: string, parse: (raw: unknown) => T): T | null {
  if (!existsSync(path)) return null;
  return parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function loadCertificationTypes() {
  const seed = join(getModuleSeedDir(MODULE_ID), "certification-types.yaml.example");
  const tenant = join(getModuleDataDir(MODULE_ID), "certification-types.yaml");
  return (
    loadYaml(tenant, (r) => certificationTypesCatalogSchema.parse(r)) ??
    loadYaml(seed, (r) => certificationTypesCatalogSchema.parse(r))
  );
}

export function loadCertificationRegistry(): {
  path: string;
  data: { as_of?: string; certifications: CertificationInstance[] };
} {
  const path = join(getModuleDataDir(MODULE_ID), "certification-registry.yaml");
  const data =
    loadYaml(path, (r) => certificationRegistryFileSchema.parse(r)) ?? {
      as_of: currentDate(),
      certifications: [],
    };
  return { path, data };
}

function saveRegistry(certs: CertificationInstance[]): string {
  const path = join(getModuleDataDir(MODULE_ID), "certification-registry.yaml");
  mkdirSync(join(path, ".."), { recursive: true });
  writeYamlFile(path, { as_of: currentDate(), certifications: certs });
  return path;
}

function nextCertId(typeId: string, existing: CertificationInstance[]): string {
  const ids = new Set(existing.map((c) => c.id));
  const slug = typeId.replace(/^cert-/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  let n = 1;
  let id = `CERT-${slug}-${String(n).padStart(3, "0")}`;
  while (ids.has(id)) {
    n += 1;
    id = `CERT-${slug}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

function knownType(typeId: string): boolean {
  const catalog = loadCertificationTypes();
  return Boolean(catalog?.types.some((t) => t.id === typeId));
}

function copyEvidence(certId: string, sourcePath: string): string {
  const src = sourcePath.startsWith("/") ? sourcePath : resolveTenantPath(sourcePath);
  if (!existsSync(src)) throw new Error(`Evidence not found: ${sourcePath}`);
  const destDir = join(getDocsDir(), "company", "licenses", "records", "certification");
  mkdirSync(destDir, { recursive: true });
  const destName = `${certId.toLowerCase()}-${currentDate()}${extname(src) || ".pdf"}`;
  const destAbs = join(destDir, destName);
  copyFileSync(src, destAbs);
  return `docs/company/licenses/records/certification/${destName}`;
}

function emitCertEvent(
  lifecycle: string,
  cert: CertificationInstance,
  notes?: string
): string | undefined {
  try {
    const evt = createCompanyEvent({
      kind: "compliance",
      title: `${lifecycle}: ${cert.cert_type_id} (${cert.id})`,
      slug: `cert-${lifecycle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 40),
      related: {
        permit_id: cert.id,
        permit_type_id: cert.cert_type_id,
        license_lifecycle: lifecycle,
        application_id: cert.application_id,
      },
      notes: notes ?? `Certification fulfilment · ${lifecycle}`,
    });
    return evt.id;
  } catch (e) {
    console.error(`⚠ cert event: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/** 取得案件開始（planned） */
export function startCertificationCase(opts: {
  type: string;
  notes?: string;
  write?: boolean;
}): { cert: CertificationInstance; path?: string; event_id?: string } {
  if (!knownType(opts.type)) {
    throw new Error(`Unknown cert type: ${opts.type}`);
  }
  const { data } = loadCertificationRegistry();
  const cert: CertificationInstance = {
    id: nextCertId(opts.type, data.certifications),
    cert_type_id: opts.type,
    status: "in_progress",
    application_id: `CAPP-${opts.type}-${currentDate()}`,
    notes: opts.notes ?? "certification obtain started",
  };
  if (!opts.write) return { cert };
  const certifications = [...data.certifications, cert];
  const path = saveRegistry(certifications);
  const event_id = emitCertEvent("CertificationApplicationStarted", cert);
  return { cert, path, event_id };
}

/** 既取得申告 · 証明書格納 · active */
export function attestCertification(opts: {
  type: string;
  certificateNumber: string;
  issuedOn: string;
  expiresOn?: string;
  evidence: string;
  write?: boolean;
}): { cert: CertificationInstance; path?: string; event_id?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.issuedOn)) {
    throw new Error("--issued-on must be YYYY-MM-DD");
  }
  if (!knownType(opts.type)) throw new Error(`Unknown cert type: ${opts.type}`);
  const { data } = loadCertificationRegistry();
  let idx = data.certifications.findIndex((c) => c.cert_type_id === opts.type);
  let cert: CertificationInstance;
  if (idx >= 0) {
    cert = { ...data.certifications[idx]! };
  } else {
    cert = {
      id: nextCertId(opts.type, data.certifications),
      cert_type_id: opts.type,
      status: "planned",
    };
    idx = data.certifications.length;
    data.certifications.push(cert);
  }
  cert = {
    ...cert,
    status: "active",
    certificate_number: opts.certificateNumber,
    issued_on: opts.issuedOn,
    expires_on: opts.expiresOn,
  };
  if (!opts.write) return { cert };
  cert = { ...cert, evidence_path: copyEvidence(cert.id, opts.evidence) };
  data.certifications[idx] = cert;
  const path = saveRegistry(data.certifications);
  const event_id = emitCertEvent("CertificationGranted", cert, "pre-existing or new grant");
  return { cert, path, event_id };
}

/** in_progress → active（審査完了） */
export function grantCertification(opts: {
  id: string;
  certificateNumber: string;
  issuedOn: string;
  expiresOn?: string;
  evidence?: string;
  write?: boolean;
}): { cert: CertificationInstance; path?: string; event_id?: string } {
  const { data } = loadCertificationRegistry();
  const idx = data.certifications.findIndex((c) => c.id === opts.id);
  if (idx < 0) throw new Error(`Certification not found: ${opts.id}`);
  let cert = { ...data.certifications[idx]! };
  cert = {
    ...cert,
    status: "active",
    certificate_number: opts.certificateNumber,
    issued_on: opts.issuedOn,
    expires_on: opts.expiresOn,
  };
  if (!opts.write) return { cert };
  if (opts.evidence) {
    cert = { ...cert, evidence_path: copyEvidence(cert.id, opts.evidence) };
  }
  data.certifications[idx] = cert;
  const path = saveRegistry(data.certifications);
  const event_id = emitCertEvent("CertificationGranted", cert);
  return { cert, path, event_id };
}

/** 更新案件: active → in_progress（renew）または期限切れ再開 */
export function renewCertification(opts: {
  id: string;
  write?: boolean;
}): { cert: CertificationInstance; path?: string; event_id?: string } {
  const { data } = loadCertificationRegistry();
  const idx = data.certifications.findIndex((c) => c.id === opts.id);
  if (idx < 0) throw new Error(`Certification not found: ${opts.id}`);
  let cert = {
    ...data.certifications[idx]!,
    status: "in_progress" as const,
    notes: `renewal started ${currentDate()}`,
    application_id: `CAPP-RENEW-${opts.id}-${currentDate()}`,
  };
  if (!opts.write) return { cert };
  data.certifications[idx] = cert;
  const path = saveRegistry(data.certifications);
  const event_id = emitCertEvent("CertificationRenewalStarted", cert);
  return { cert, path, event_id };
}

/** expires_on 超過の active を expired に（スキャン） */
export function scanExpiredCertifications(opts: { write?: boolean }): {
  expired: CertificationInstance[];
  path?: string;
} {
  const { data } = loadCertificationRegistry();
  const today = currentDate();
  const expired: CertificationInstance[] = [];
  const next = data.certifications.map((c) => {
    if (c.status === "active" && c.expires_on && c.expires_on < today) {
      const upd = { ...c, status: "expired" as const };
      expired.push(upd);
      return upd;
    }
    return c;
  });
  if (!opts.write || !expired.length) return { expired };
  const path = saveRegistry(next);
  for (const c of expired) emitCertEvent("CertificationExpired", c);
  return { expired, path };
}

export function listActiveCertTypeIds(): Set<string> {
  const { data } = loadCertificationRegistry();
  const today = currentDate();
  return new Set(
    data.certifications
      .filter((c) => {
        if (c.status !== "active") return false;
        if (c.expires_on && c.expires_on < today) return false;
        return true;
      })
      .map((c) => c.cert_type_id)
  );
}
