import { z } from "zod";

/**
 * ビジネスユニット・レジストリ（正本）
 * yojitsu の segment / 物件 / 組織ユニットを BU に対応づけ、
 * 「BU積み上げ → 集約 → 全社統括（バックオフィス・共通費）」の3層で予実を集計する。
 * kind:
 *   - operating     … 営業損益に集計する事業ユニット
 *   - corporate     … 全社統括（バックオフィス人件費・共通費）。営業費用として集約
 *   - non_operating … 営業外（資産運用・受取利息等）。経常損益で加算
 */
export const businessUnitKind = z.enum([
  "operating",
  "corporate",
  "non_operating",
]);

export const businessUnitStatus = z.enum(["active", "planned"]);

export const businessUnitSchema = z.object({
  id: z.string().regex(/^BU-[A-Z0-9-]+$/),
  label: z.string().min(1),
  kind: businessUnitKind,
  org_unit_id: z.string().min(1).optional(),
  /** yojitsu の segment 名（完全一致）。`_corporate` 等の内部セグメントも指定可 */
  segments: z.array(z.string().min(1)).default([]),
  property_ids: z.array(z.string().min(1)).default([]),
  status: businessUnitStatus.default("active"),
  notes: z.string().optional(),
});

export const businessUnitsFileSchema = z.object({
  version: z.literal(1).default(1),
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  as_of: z.string().optional(),
  units: z.array(businessUnitSchema).min(1),
  notes: z.string().optional(),
});

export type BusinessUnitKind = z.output<typeof businessUnitKind>;
export type BusinessUnit = z.output<typeof businessUnitSchema>;
export type BusinessUnitsFile = z.output<typeof businessUnitsFileSchema>;
