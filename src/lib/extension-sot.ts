/**
 * Deterministic SoT helpers for extension Agents that previously had
 * agent-runtime skills only (procurement · governance · risk · privacy).
 *
 * Counts and statuses only — no L2 values in output.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadClassificationRegistry } from "./classification.js";
import { currentDate, getDataDir, getDocsDir, readYamlFile } from "./utils.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const RENEWAL_WINDOW_DAYS = 90;

export const procurementVendorsFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  vendors: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        category: z.string().min(1).optional(),
        status: z.string().min(1).optional(),
        last_eval: isoDate.optional(),
      })
    )
    .default([]),
});

export const procurementOrdersFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  orders: z
    .array(
      z.object({
        id: z.string().min(1),
        vendor_id: z.string().min(1).optional(),
        amount_yen: z.number().nonnegative().optional(),
        status: z.string().min(1).optional(),
        requested_on: isoDate.optional(),
      })
    )
    .default([]),
});

export const governanceMeetingsFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  meetings: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.string().min(1),
        scheduled_on: isoDate,
        status: z.string().min(1).optional(),
      })
    )
    .default([]),
});

export const governanceRegisterFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        last_reviewed: isoDate.optional(),
        status: z.string().min(1).optional(),
      })
    )
    .default([]),
});

export const riskRegisterFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  risks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        severity: z.string().min(1).optional(),
        status: z.string().min(1).optional(),
        owner: z.string().min(1).optional(),
      })
    )
    .default([]),
});

export const riskInsuranceFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  policies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        renews_on: isoDate.optional(),
        status: z.string().min(1).optional(),
      })
    )
    .default([]),
});

export type ProcurementVendorsFile = z.output<typeof procurementVendorsFileSchema>;
export type ProcurementOrdersFile = z.output<typeof procurementOrdersFileSchema>;
export type GovernanceMeetingsFile = z.output<typeof governanceMeetingsFileSchema>;
export type GovernanceRegisterFile = z.output<typeof governanceRegisterFileSchema>;
export type RiskRegisterFile = z.output<typeof riskRegisterFileSchema>;
export type RiskInsuranceFile = z.output<typeof riskInsuranceFileSchema>;

function loadOptional<S extends z.ZodTypeAny>(rel: string, schema: S): z.output<S> | undefined {
  const path = join(getDataDir(), rel);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, schema);
}

function countBy(values: Array<string | undefined>, fallback = "(unset)"): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value ?? fallback;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function formatCounts(counts: Record<string, number>): string[] {
  const keys = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  if (!keys.length) return ["- （なし）"];
  return keys.map((key) => `- ${key}: ${counts[key]}`);
}

function daysUntil(iso: string, today = currentDate()): number {
  const a = new Date(`${today}T00:00:00Z`);
  const b = new Date(`${iso}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function loadProcurementVendors(): ProcurementVendorsFile | undefined {
  return loadOptional("procurement/vendors.yaml", procurementVendorsFileSchema);
}

export function loadProcurementOrders(): ProcurementOrdersFile | undefined {
  return loadOptional("procurement/orders.yaml", procurementOrdersFileSchema);
}

export function loadGovernanceMeetings(): GovernanceMeetingsFile | undefined {
  return loadOptional("governance/meetings.yaml", governanceMeetingsFileSchema);
}

export function loadGovernanceRegister(): GovernanceRegisterFile | undefined {
  return loadOptional("governance/register.yaml", governanceRegisterFileSchema);
}

export function loadRiskRegister(): RiskRegisterFile | undefined {
  return loadOptional("risk/register.yaml", riskRegisterFileSchema);
}

export function loadRiskInsurance(): RiskInsuranceFile | undefined {
  return loadOptional("risk/insurance.yaml", riskInsuranceFileSchema);
}

export function formatProcurementVendorsMarkdown(file?: ProcurementVendorsFile): string {
  const vendors = file?.vendors ?? [];
  return [
    "# 供給者評価サマリ",
    "",
    `ベンダー数: ${vendors.length}${file?.as_of ? ` · as_of ${file.as_of}` : ""}`,
    "",
    "## ステータス別",
    ...formatCounts(countBy(vendors.map((v) => v.status))),
    "",
    "正本: data/procurement/vendors.yaml",
    "",
    "次: `orgos skills run procurement_vendor_eval` · `orgos validate`",
  ].join("\n");
}

export function formatProcurementOrdersMarkdown(file?: ProcurementOrdersFile): string {
  const orders = file?.orders ?? [];
  const pending = orders.filter((order) => (order.status ?? "") === "pending_approval").length;
  return [
    "# 発注レビューサマリ",
    "",
    `発注数: ${orders.length} · 承認待ち: ${pending}${file?.as_of ? ` · as_of ${file.as_of}` : ""}`,
    "",
    "## ステータス別",
    ...formatCounts(countBy(orders.map((order) => order.status))),
    "",
    "正本: data/procurement/orders.yaml",
    "",
    "次: `orgos skills run procurement_order_review` · REG-004 稟議",
  ].join("\n");
}

export function formatGovernanceMeetingsMarkdown(
  file?: GovernanceMeetingsFile,
  today = currentDate()
): string {
  const meetings = file?.meetings ?? [];
  const upcoming = meetings.filter((m) => m.scheduled_on >= today).length;
  return [
    "# 会議準備サマリ",
    "",
    `会議数: ${meetings.length} · 本日以降: ${upcoming}${file?.as_of ? ` · as_of ${file.as_of}` : ""}`,
    "",
    "## 種別",
    ...formatCounts(countBy(meetings.map((m) => m.kind))),
    "",
    "## ステータス別",
    ...formatCounts(countBy(meetings.map((m) => m.status))),
    "",
    "正本: data/governance/meetings.yaml",
    "",
    "次: `orgos skills run governance_meeting_prep` · REG-002 / REG-003",
  ].join("\n");
}

export function formatGovernanceRegisterMarkdown(file?: GovernanceRegisterFile): string {
  const items = file?.items ?? [];
  return [
    "# ガバナンス台帳サマリ",
    "",
    `台帳項目: ${items.length}${file?.as_of ? ` · as_of ${file.as_of}` : ""}`,
    "",
    "## ステータス別",
    ...formatCounts(countBy(items.map((item) => item.status))),
    "",
    "正本: data/governance/register.yaml",
    "",
    "次: `orgos skills run governance_register_review`",
  ].join("\n");
}

export function formatRiskRegisterMarkdown(file?: RiskRegisterFile): string {
  const risks = file?.risks ?? [];
  const open = risks.filter((risk) => (risk.status ?? "open") !== "closed").length;
  return [
    "# リスク台帳サマリ",
    "",
    `リスク数: ${risks.length} · 未クローズ: ${open}${file?.as_of ? ` · as_of ${file.as_of}` : ""}`,
    "",
    "## 重大度",
    ...formatCounts(countBy(risks.map((risk) => risk.severity))),
    "",
    "## ステータス別",
    ...formatCounts(countBy(risks.map((risk) => risk.status))),
    "",
    "正本: data/risk/register.yaml",
    "",
    "次: `orgos skills run risk_register_review`",
  ].join("\n");
}

export function formatRiskInsuranceMarkdown(
  file?: RiskInsuranceFile,
  today = currentDate()
): string {
  const policies = file?.policies ?? [];
  const due = policies.filter((policy) => {
    if (!policy.renews_on) return false;
    const days = daysUntil(policy.renews_on, today);
    return days >= 0 && days <= RENEWAL_WINDOW_DAYS;
  }).length;
  return [
    "# 保険更新サマリ",
    "",
    `証券数: ${policies.length} · ${RENEWAL_WINDOW_DAYS}日以内更新: ${due}${
      file?.as_of ? ` · as_of ${file.as_of}` : ""
    }`,
    "",
    "## ステータス別",
    ...formatCounts(countBy(policies.map((policy) => policy.status))),
    "",
    "正本: data/risk/insurance.yaml",
    "",
    "次: `orgos skills run risk_insurance_renewal`",
  ].join("\n");
}

export function formatPrivacyInventoryMarkdown(): string {
  let counts: Record<string, number> = {};
  let total = 0;
  let asOf = "";
  try {
    const registry = loadClassificationRegistry();
    asOf = registry.as_of ?? "";
    total = registry.resources.length;
    counts = countBy(registry.resources.map((resource) => resource.level));
  } catch {
    counts = {};
  }
  return [
    "# データ棚卸サマリ",
    "",
    `分類リソース: ${total}${asOf ? ` · as_of ${asOf}` : ""}`,
    "",
    "## レベル別（件数のみ）",
    ...formatCounts(counts),
    "",
    "正本: data/classification-registry.yaml",
    "",
    "次: `orgos classification check` · `orgos skills run privacy_data_inventory`",
  ].join("\n");
}

export function formatPrivacyImpactMarkdown(): string {
  const dir = join(getDocsDir(), "compliance", "privacy");
  const files = existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    : [];
  const impact = files.filter((name) => /dpia|impact|incident|インシデント/i.test(name)).length;
  return [
    "# PIMS · DPIA レビューサマリ",
    "",
    `privacy 文書: ${files.length} · DPIA/インシデント候補: ${impact}`,
    "",
    "正本: docs/compliance/privacy/",
    "",
    "次: `orgos skills run privacy_impact_review` · REG-010",
  ].join("\n");
}
