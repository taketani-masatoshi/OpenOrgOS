/**
 * Required Compliance — 業モジュールが宣言する「何が必要か」（ADR 0012）。
 * 状態 SSOT は持たない。Fulfilment（行許可台帳等）を解決して表示する。
 */
import { z } from "zod";
import { dateString } from "./common.js";

export const complianceSeverity = z.enum(["required", "recommended", "optional"]);

/** Fulfilment チャネル（取得・維持を担当するモジュール種別） */
export const complianceFulfilmentKind = z.enum([
  "license",
  "certification",
  "registration",
  "inspection",
  "specialized",
]);

export const complianceMatchMode = z.enum(["any_of", "all_of"]);

export const requiredComplianceRequirementSchema = z.object({
  id: z.string().min(1),
  /** license: permit_type_id · certification: cert_type_id · 等 */
  fulfilment: complianceFulfilmentKind.default("license"),
  severity: complianceSeverity.default("required"),
  match: complianceMatchMode.default("any_of"),
  compliance_type_ids: z.array(z.string().min(1)).min(1),
  legal_basis: z.string().optional(),
  authority_ja: z.string().optional(),
  reference_url: z.string().url().optional(),
  notes: z.string().optional(),
});

export const requiredComplianceFileSchema = z.object({
  module_id: z.string().min(1),
  as_of: dateString.optional(),
  schema_version: z.coerce.number().int().positive().default(1),
  requirements: z.array(requiredComplianceRequirementSchema).default([]),
});

export type ComplianceSeverity = z.output<typeof complianceSeverity>;
export type ComplianceFulfilmentKind = z.output<typeof complianceFulfilmentKind>;
export type RequiredComplianceRequirement = z.output<typeof requiredComplianceRequirementSchema>;
export type RequiredComplianceFile = z.output<typeof requiredComplianceFileSchema>;
