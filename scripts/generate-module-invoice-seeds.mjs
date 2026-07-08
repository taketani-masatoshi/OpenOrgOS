#!/usr/bin/env node
/** Generate invoice seed YAML/body for activation_ready → production_ready promotion. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  ["event_space", "event-space-monthly", "イベントスペース利用料"],
  ["retail_store", "retail-monthly", "店舗運営サービス料"],
  ["logistics", "logistics-monthly", "物流サービス料"],
  ["clinic", "clinic-monthly", "クリニック運営サービス料"],
  ["construction", "construction-monthly", "建設プロジェクト費用"],
  ["education", "education-monthly", "教育サービス料"],
  ["venture_capital", "vc-monthly", "ファンド管理料"],
  ["software_outsourcing", "software-out-monthly", "受託開発費用"],
  ["event_operations", "event-ops-monthly", "イベント運営費用"],
  ["real_estate_brokerage", "brokerage-monthly", "仲介手数料"],
  ["property_management", "pm-monthly", "管理業務料"],
];

for (const [mod, tid, label] of MODULES) {
  const seedDir = join(ROOT, "steward/modules", mod, "seed");
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(
    join(seedDir, `invoice-${tid}.yaml`),
    `id: ${tid}
module: ${mod}
description: ${label}月次請求
pdf:
  title: 請 求 書
  line_label: ${label}
  line_note: "{year_month} 分"
  tax_label: 消費税（10%）
  footer_notes: お振込手数料は貴社にてご負担ください。
email:
  subject: "【請求】{year_month} ${label} — {company_name}"
  body_template: invoice-${tid}-body.txt
`
  );
  writeFileSync(
    join(seedDir, `invoice-${tid}-body.txt`),
    `{tenant_name} 御中

{year_month} 分の${label}をご請求申し上げます。

{company_name}
`
  );
  console.log(`wrote ${mod}/invoice-${tid}.*`);
}
