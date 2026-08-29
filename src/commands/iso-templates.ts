import { setTenantId } from "../lib/tenant.js";
import {
  applyIsoTemplateSync,
  planIsoTemplateSync,
  type IsoTemplatePlan,
} from "../lib/iso-templates.js";

export interface IsoTemplatesCliOptions {
  tenant?: string;
  write?: boolean;
  json?: boolean;
}

function printPlan(plan: IsoTemplatePlan, wrote: boolean): void {
  if (plan.evidence_forms === "partial") {
    console.log(
      `※ ${plan.standard} の様式は未完備（catalog.yaml: evidence_forms: partial）。` +
        "統制が求める記録の一部は自前で作成する必要があります。\n",
    );
  }
  if (plan.rows.length === 0) {
    console.log(`${plan.standard}: パックに templates/ がありません。`);
    return;
  }
  const create = plan.rows.filter((r) => r.action === "create");
  const keep = plan.rows.filter((r) => r.action === "keep");
  console.log(
    `${plan.standard} 証拠様式 → ${plan.target_dir}/ · ${wrote ? "配置" : "配置予定"} ${create.length} 件 · 既存維持 ${keep.length} 件\n`,
  );
  console.log("| 様式 | 状態 |");
  console.log("|------|------|");
  for (const row of plan.rows) {
    console.log(`| ${row.file} | ${row.action === "create" ? (wrote ? "配置" : "未配置") : "既存（保持）"} |`);
  }
  if (!wrote && create.length > 0) {
    console.log(`\n配置: orgos iso templates ${plan.standard} --write`);
  }
}

export function runIsoTemplates(
  standard: string,
  options: IsoTemplatesCliOptions = {},
): void {
  if (options.tenant) setTenantId(options.tenant);
  const plan = planIsoTemplateSync(standard);
  if (options.write) applyIsoTemplateSync(plan);
  if (options.json) {
    console.log(JSON.stringify({ ...plan, written: options.write === true }, null, 2));
    return;
  }
  printPlan(plan, options.write === true);
}
