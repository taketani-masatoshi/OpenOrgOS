/**
 * 業モジュール有効化時の Required Compliance intake（ADR 0012）。
 * 「OOO 外部で既に取得済みか」を申告し、証明書を licenses/records に格納 · PER を台帳化。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import YAML from "yaml";
import {
  permitRegistryFileSchema,
  type PermitInstanceEntry,
} from "../../schemas/jp-permit-registry.js";
import { listLicenseGateGroups, loadRequiredComplianceFile } from "./required-compliance.js";
import { getModuleDataDir } from "./module-business-data.js";
import { getModuleRootDir } from "./modules.js";
import { emitLicenseLifecycleEvent } from "./permit-license-events.js";
import { currentDate, getDocsDir, resolveTenantPath, writeYamlFile } from "./utils.js";

function isCatalogPermitTypeId(permitTypeId: string): boolean {
  const path = join(getModuleRootDir("jp_permit_registry"), "catalog", "permit-types.csv");
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf-8");
  return text.split(/\r?\n/).some((line) => {
    const id = line.split(",")[0]?.trim();
    return id === permitTypeId;
  });
}

export type ComplianceIntakeItemStatus =
  | "satisfied"
  | "needs_attest"
  | "needs_decision"
  | "no_license_requirements";

export interface ComplianceIntakeItem {
  requirement_id: string;
  match: "any_of" | "all_of";
  permit_type_ids: string[];
  status: ComplianceIntakeItemStatus;
  /** 台帳上の関連 PER（active / pending 含む） */
  related_permits: Array<{ id: string; permit_type_id: string; status: string; evidence_path?: string }>;
  guidance: string;
}

export interface ComplianceIntakePlan {
  module_id: string;
  property_id?: string;
  as_of: string;
  has_declaration: boolean;
  items: ComplianceIntakeItem[];
  next_cli: string[];
}

function loadPermits(): PermitInstanceEntry[] {
  try {
    const path = join(getModuleDataDir("jp_permit_registry"), "permit-registry.yaml");
    if (!existsSync(path)) return [];
    return permitRegistryFileSchema.parse(YAML.parse(readFileSync(path, "utf-8"))).permits;
  } catch {
    return [];
  }
}

function savePermits(permits: PermitInstanceEntry[]): string {
  const path = join(getModuleDataDir("jp_permit_registry"), "permit-registry.yaml");
  mkdirSync(join(path, ".."), { recursive: true });
  writeYamlFile(path, { as_of: currentDate(), permits });
  return path;
}

function scopePermits(
  permits: PermitInstanceEntry[],
  typeIds: string[],
  propertyId?: string
): PermitInstanceEntry[] {
  return permits.filter((p) => {
    if (!typeIds.includes(p.permit_type_id)) return false;
    if (propertyId && p.property_id && p.property_id !== propertyId) return false;
    if (propertyId && !p.property_id) return false;
    return true;
  });
}

function groupOk(
  match: "any_of" | "all_of",
  typeIds: string[],
  activeTypes: Set<string>
): boolean {
  if (match === "all_of") return typeIds.every((id) => activeTypes.has(id));
  return typeIds.some((id) => activeTypes.has(id));
}

/** 業種フォルダ名（docs/company/licenses/records/{slug}/） */
export function licenseEvidenceCategory(permitTypeId: string): string {
  const id = permitTypeId.replace(/^pt-/, "");
  if (id.startsWith("ryokan") || id.startsWith("minpaku")) return "ryokan";
  if (id.startsWith("medical") || id.startsWith("pharma") || id.startsWith("cosmetics")) {
    return "medical";
  }
  if (id.startsWith("takken") || id.includes("real-estate") || id.includes("rental-housing")) {
    return "real-estate";
  }
  if (id.startsWith("food") || id.startsWith("alcohol")) return "food";
  if (id.startsWith("fiea") || id.startsWith("bank") || id.includes("finance")) return "finance";
  if (id.startsWith("staffing") || id.startsWith("job-intro")) return "labor";
  if (id.startsWith("fire") || id.startsWith("building")) return "fire-building";
  return "other";
}

export function planComplianceIntake(
  moduleId: string,
  opts: { propertyId?: string } = {}
): ComplianceIntakePlan {
  const as_of = currentDate();
  const declaration = loadRequiredComplianceFile(moduleId);
  const next_cli: string[] = [
    `orgos operations permit-app intake plan --module ${moduleId}`,
    `orgos operations permit-app intake attest --module ${moduleId} --type <pt-...> --permit-number <no> --issued-on YYYY-MM-DD --evidence /path/to.pdf --write`,
    `orgos operations permit-app intake start-app --module ${moduleId} --type <pt-...> --write`,
  ];

  if (!declaration) {
    return {
      module_id: moduleId,
      property_id: opts.propertyId,
      as_of,
      has_declaration: false,
      items: [
        {
          requirement_id: "none",
          match: "any_of",
          permit_type_ids: [],
          status: "no_license_requirements",
          related_permits: [],
          guidance:
            "required-compliance.yaml なし — 行許可ゲート対象外。必要ならモジュールに宣言を追加。",
        },
      ],
      next_cli: [],
    };
  }

  const groups = listLicenseGateGroups(moduleId);
  const permits = loadPermits();
  const items: ComplianceIntakeItem[] = [];

  for (const g of groups) {
    const related = scopePermits(permits, g.permit_type_ids, opts.propertyId);
    const activeTypes = new Set(
      related.filter((p) => p.status === "active").map((p) => p.permit_type_id)
    );
    if (groupOk(g.match, g.permit_type_ids, activeTypes)) {
      items.push({
        requirement_id: g.requirement_id,
        match: g.match,
        permit_type_ids: g.permit_type_ids,
        status: "satisfied",
        related_permits: related.map((p) => ({
          id: p.id,
          permit_type_id: p.permit_type_id,
          status: p.status,
          evidence_path: p.evidence_path,
        })),
        guidance: "充足（PER active）。証跡未格納なら attest --evidence で追記可。",
      });
      continue;
    }

    if (related.length) {
      items.push({
        requirement_id: g.requirement_id,
        match: g.match,
        permit_type_ids: g.permit_type_ids,
        status: "needs_attest",
        related_permits: related.map((p) => ({
          id: p.id,
          permit_type_id: p.permit_type_id,
          status: p.status,
          evidence_path: p.evidence_path,
        })),
        guidance:
          "台帳に PER ありだが active 未達。既取得なら attest（許可番号・発行日・PDF）で active 化。未取得なら start-app。",
      });
    } else {
      items.push({
        requirement_id: g.requirement_id,
        match: g.match,
        permit_type_ids: g.permit_type_ids,
        status: "needs_decision",
        related_permits: [],
        guidance:
          "OOO に記録なし。人手で既取得 → attest。これから取得 → start-app（許可取得モジュールへ案件作成）。",
      });
    }
  }

  return {
    module_id: moduleId,
    property_id: opts.propertyId,
    as_of,
    has_declaration: true,
    items,
    next_cli,
  };
}

export function formatComplianceIntakePlan(plan: ComplianceIntakePlan): string {
  const lines = [
    `# Compliance intake — ${plan.module_id}`,
    "",
    `as_of: ${plan.as_of}${plan.property_id ? ` · property: ${plan.property_id}` : ""}`,
    "",
  ];
  if (!plan.has_declaration) {
    lines.push(plan.items[0]?.guidance ?? "（宣言なし）");
    return lines.join("\n");
  }
  lines.push(
    "業モジュール有効化に伴い、行許可取得モジュールへ通知しました。",
    "各要件について「既に取得済みか / これから申請か」を申告してください。",
    ""
  );
  for (const item of plan.items) {
    lines.push(`## ${item.requirement_id} [${item.status}]`);
    lines.push(`- 対象: ${item.permit_type_ids.join(" | ")} (${item.match})`);
    lines.push(`- ${item.guidance}`);
    if (item.related_permits.length) {
      for (const p of item.related_permits) {
        lines.push(
          `  - ${p.id} · ${p.permit_type_id} · ${p.status}${p.evidence_path ? ` · ${p.evidence_path}` : ""}`
        );
      }
    }
    lines.push("");
  }
  if (plan.next_cli.length) {
    lines.push("## 次のコマンド");
    for (const c of plan.next_cli) lines.push(`- \`${c}\``);
  }
  return lines.join("\n");
}

function intakeSessionPath(moduleId: string): string {
  return join(getModuleDataDir("jp_permit_application"), "intake", `${moduleId}.yaml`);
}

export function persistIntakePlan(plan: ComplianceIntakePlan): string {
  const path = intakeSessionPath(plan.module_id);
  mkdirSync(join(path, ".."), { recursive: true });
  writeYamlFile(path, plan);
  return path;
}

export function copyLicenseEvidenceFile(opts: {
  permitTypeId: string;
  sourcePath: string;
  permitId: string;
}): { absPath: string; logicalPath: string; category: string } {
  const src = opts.sourcePath.startsWith("/")
    ? opts.sourcePath
    : resolveTenantPath(opts.sourcePath);
  if (!existsSync(src)) {
    throw new Error(`Evidence file not found: ${opts.sourcePath}`);
  }
  const category = licenseEvidenceCategory(opts.permitTypeId);
  const ext = extname(src) || ".pdf";
  const destDir = join(getDocsDir(), "company", "licenses", "records", category);
  mkdirSync(destDir, { recursive: true });
  const destName = `${opts.permitId.toLowerCase()}-${currentDate()}${ext}`;
  const destAbs = join(destDir, destName);
  copyFileSync(src, destAbs);
  const logical = `docs/company/licenses/records/${category}/${destName}`;
  appendLicenseIndexRow({
    category,
    title: opts.permitTypeId,
    storage_path: `records/${category}/${destName}`,
    permit_id: opts.permitId,
  });
  return { absPath: destAbs, logicalPath: logical, category };
}

function appendLicenseIndexRow(row: {
  category: string;
  title: string;
  storage_path: string;
  permit_id: string;
}): void {
  const indexPath = join(getDocsDir(), "company", "licenses", "INDEX.csv");
  mkdirSync(join(indexPath, ".."), { recursive: true });
  const header =
    "doc_id,category,title,property_id,contract_id,issued_by,issued_date,expiry_date,storage_path,status,notes\n";
  let body = "";
  let next = 1;
  if (existsSync(indexPath)) {
    body = readFileSync(indexPath, "utf-8");
    if (!body.endsWith("\n")) body += "\n";
    const nums = [...body.matchAll(/^LIC-(\d+)/gm)].map((m) => Number(m[1]));
    if (nums.length) next = Math.max(...nums) + 1;
  } else {
    body = header;
  }
  const id = `LIC-${String(next).padStart(3, "0")}`;
  body += `${id},${row.category},${row.title},,,,,${currentDate()},,${row.storage_path},active,${row.permit_id} attest\n`;
  writeFileSync(indexPath, body, "utf-8");
}

function nextPermitId(type: string, existing: PermitInstanceEntry[]): string {
  const ids = new Set(existing.map((p) => p.id));
  const slug = type.replace(/^pt-/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  let n = 1;
  let id = `PER-${slug}-${String(n).padStart(3, "0")}`;
  while (ids.has(id)) {
    n += 1;
    id = `PER-${slug}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

export interface AttestExistingPermitOptions {
  /** 省略可 — 省略時はカタログ種別のみで検証（業モジュール未導入の単独取得） */
  moduleId?: string;
  permitTypeId: string;
  permitNumber: string;
  issuedOn: string;
  evidencePath: string;
  propertyId?: string;
  issuer?: string;
  write?: boolean;
}

export function attestExistingPermit(opts: AttestExistingPermitOptions): {
  permit: PermitInstanceEntry;
  evidence_logical?: string;
  registry_path?: string;
  event_id?: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.issuedOn)) {
    throw new Error("--issued-on must be YYYY-MM-DD");
  }
  if (opts.moduleId) {
    const file = loadRequiredComplianceFile(opts.moduleId);
    if (file) {
      const allowed = file.requirements
        .filter((r) => r.fulfilment === "license")
        .flatMap((r) => r.compliance_type_ids);
      if (allowed.length && !allowed.includes(opts.permitTypeId)) {
        throw new Error(
          `${opts.permitTypeId} is not in ${opts.moduleId} required-compliance license list`
        );
      }
    }
  } else if (!isCatalogPermitTypeId(opts.permitTypeId)) {
    throw new Error(
      `Unknown permit type: ${opts.permitTypeId} (not in permit-types.csv)`
    );
  }

  const permits = loadPermits();
  let idx = permits.findIndex((p) => {
    if (p.permit_type_id !== opts.permitTypeId) return false;
    if (opts.propertyId) return p.property_id === opts.propertyId;
    return !p.property_id;
  });

  let permit: PermitInstanceEntry;
  if (idx >= 0) {
    permit = {
      ...permits[idx]!,
      status: "active",
      permit_number: opts.permitNumber,
      issued_on: opts.issuedOn,
      issuer: opts.issuer ?? permits[idx]!.issuer,
      property_id: opts.propertyId ?? permits[idx]!.property_id,
    };
  } else {
    permit = {
      id: nextPermitId(opts.permitTypeId, permits),
      permit_type_id: opts.permitTypeId,
      status: "active",
      permit_number: opts.permitNumber,
      issued_on: opts.issuedOn,
      issuer: opts.issuer,
      property_id: opts.propertyId as PermitInstanceEntry["property_id"],
    };
    idx = permits.length;
    permits.push(permit);
  }

  if (!opts.write) {
    return { permit };
  }

  const copied = copyLicenseEvidenceFile({
    permitTypeId: opts.permitTypeId,
    sourcePath: opts.evidencePath,
    permitId: permit.id,
  });
  permit = { ...permit, evidence_path: copied.logicalPath };
  permits[idx] = permit;
  const registry_path = savePermits(permits);

  const applicationId = `ATT-EST-${opts.moduleId ?? "catalog"}-${permit.id}`.slice(0, 64);
  const evt = emitLicenseLifecycleEvent({
    lifecycle: "LicenseGranted",
    applicationId,
    permitTypeId: opts.permitTypeId,
    permitId: permit.id,
    propertyId: opts.propertyId,
    notes: opts.moduleId
      ? `pre-existing permit attested on module intake · evidence=${copied.logicalPath}`
      : `pre-existing permit attested (catalog-only) · evidence=${copied.logicalPath}`,
  });

  if (opts.moduleId) {
    const plan = planComplianceIntake(opts.moduleId, { propertyId: opts.propertyId });
    persistIntakePlan(plan);
  }

  return {
    permit,
    evidence_logical: copied.logicalPath,
    registry_path,
    event_id: evt?.id,
  };
}

export function notifyPermitModuleOnActivate(moduleId: string): ComplianceIntakePlan {
  const plan = planComplianceIntake(moduleId);
  if (plan.has_declaration && plan.items.some((i) => i.status !== "satisfied" && i.status !== "no_license_requirements")) {
    persistIntakePlan(plan);
  } else if (plan.has_declaration) {
    persistIntakePlan(plan);
  }
  return plan;
}
