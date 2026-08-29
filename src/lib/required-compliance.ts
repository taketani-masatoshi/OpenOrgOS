/**
 * Required Compliance ローダ — 業モジュール宣言の読取 · G-01 入力。
 * 正本パス: steward/modules/{id}/required-compliance.yaml
 *          または jurisdiction-packs/.../modules/{id}/required-compliance.yaml
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  requiredComplianceFileSchema,
  type RequiredComplianceFile,
  type RequiredComplianceRequirement,
} from "../../schemas/required-compliance.js";
import { getModuleRootDir, resolveModuleLocation } from "./modules.js";

export const REQUIRED_COMPLIANCE_FILENAME = "required-compliance.yaml";

export function requiredCompliancePath(moduleId: string): string | null {
  const loc = resolveModuleLocation(moduleId);
  if (!loc) return null;
  return join(loc.rootDir, REQUIRED_COMPLIANCE_FILENAME);
}

export function loadRequiredComplianceFile(moduleId: string): RequiredComplianceFile | null {
  const path = requiredCompliancePath(moduleId);
  if (!path || !existsSync(path)) return null;
  const raw = YAML.parse(readFileSync(path, "utf-8"));
  const parsed = requiredComplianceFileSchema.parse(raw);
  if (parsed.module_id !== moduleId) {
    throw new Error(
      `required-compliance module_id mismatch: file=${parsed.module_id} expected=${moduleId}`
    );
  }
  return parsed;
}

/** 有効な required（severity=required）かつ fulfilment=license のゲート用グループ */
export interface LicenseComplianceGateGroup {
  module_id: string;
  requirement_id: string;
  match: "any_of" | "all_of";
  permit_type_ids: string[];
  legal_basis?: string;
  authority_ja?: string;
  reference_url?: string;
}

export interface RegistrationComplianceGateGroup {
  module_id: string;
  requirement_id: string;
  match: "any_of" | "all_of";
  permit_type_ids: string[];
  legal_basis?: string;
  authority_ja?: string;
  reference_url?: string;
}

export interface TypedComplianceGateGroup {
  module_id: string;
  requirement_id: string;
  fulfilment: "license" | "certification" | "inspection";
  match: "any_of" | "all_of";
  type_ids: string[];
  legal_basis?: string;
  authority_ja?: string;
  reference_url?: string;
}

function requiredGroups(
  moduleId: string,
  fulfilment: "license" | "certification" | "inspection"
): TypedComplianceGateGroup[] {
  const file = loadRequiredComplianceFile(moduleId);
  if (!file) return [];
  return file.requirements
    .filter((r) => r.severity === "required" && r.fulfilment === fulfilment)
    .map((r) => ({
      module_id: moduleId,
      requirement_id: r.id,
      fulfilment,
      match: r.match,
      type_ids: [...r.compliance_type_ids],
      legal_basis: r.legal_basis,
      authority_ja: r.authority_ja,
      reference_url: r.reference_url,
    }));
}

export function listLicenseGateGroups(moduleId: string): LicenseComplianceGateGroup[] {
  return requiredGroups(moduleId, "license").map((g) => ({
    module_id: g.module_id,
    requirement_id: g.requirement_id,
    match: g.match,
    permit_type_ids: g.type_ids,
    legal_basis: g.legal_basis,
    authority_ja: g.authority_ja,
    reference_url: g.reference_url,
  }));
}

export function listRegistrationGateGroups(moduleId: string): RegistrationComplianceGateGroup[] {
  const file = loadRequiredComplianceFile(moduleId);
  if (!file) return [];
  return file.requirements
    .filter((r) => r.severity === "required" && r.fulfilment === "registration")
    .map((r) => ({
      module_id: moduleId,
      requirement_id: r.id,
      match: r.match,
      permit_type_ids: [...r.compliance_type_ids],
      legal_basis: r.legal_basis,
      authority_ja: r.authority_ja,
      reference_url: r.reference_url,
    }));
}

export function listCertificationGateGroups(moduleId: string): TypedComplianceGateGroup[] {
  return requiredGroups(moduleId, "certification");
}

export function listInspectionGateGroups(moduleId: string): TypedComplianceGateGroup[] {
  return requiredGroups(moduleId, "inspection");
}

/**
 * G-01 互換: module → いずれかが active であるべき許可種別（any_of をフラット化）。
 * 複数 requirement がある場合は OR ではなく「各 requirement が充足」が本来だが、
 * 現行 G-01 は any_of の単一集合だったため、各 group を個別ブロッカーにする。
 */
export function licenseTypesAnyOfFlat(moduleId: string): string[] {
  const groups = listLicenseGateGroups(moduleId);
  const anyOf = groups.filter((g) => g.match === "any_of");
  if (!anyOf.length) return [];
  // 複数 any_of がある場合は先頭グループを従来互換の flat に（詳細は listLicenseGateGroups）
  if (anyOf.length === 1) return anyOf[0]!.permit_type_ids;
  const ids = new Set<string>();
  for (const g of anyOf) for (const id of g.permit_type_ids) ids.add(id);
  return [...ids];
}

export function summarizeRequirement(r: RequiredComplianceRequirement): string {
  const ids = r.compliance_type_ids.join("|");
  return `${r.id} [${r.severity}/${r.fulfilment}/${r.match}] ${ids}`;
}

/** カタログ配置確認用 — 宣言ファイルが存在する module id */
export function moduleHasRequiredCompliance(moduleId: string): boolean {
  const path = requiredCompliancePath(moduleId);
  return Boolean(path && existsSync(path));
}

export function getModuleRootForCompliance(moduleId: string): string {
  return getModuleRootDir(moduleId);
}
