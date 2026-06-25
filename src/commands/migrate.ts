import { writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { loadYojitsuFyPlan } from "../lib/data.js";
import { serializeYojitsuPlanV2 } from "../lib/yojitsu-normalize.js";
import { getDataDir } from "../lib/utils.js";

export interface MigrateYojitsuOptions {
  fiscalYear: string;
  dryRun?: boolean;
  write?: boolean;
}

export function runMigrateYojitsu(opts: MigrateYojitsuOptions): void {
  const id = opts.fiscalYear.toLowerCase().replace(/^fy/, "fy");
  const rel = `plans/yojitsu-${id}.yaml`;
  const plan = loadYojitsuFyPlan(opts.fiscalYear);
  if (!plan) {
    console.error(`yojitsu plan not found: data/${rel}`);
    process.exit(1);
  }

  const v2 = serializeYojitsuPlanV2(plan);
  const yaml = YAML.stringify(v2, { lineWidth: 120 });

  if (opts.dryRun || !opts.write) {
    console.log(`# dry-run: data/${rel} → v2 (${plan.months.length} months)`);
    console.log(yaml.slice(0, 2000) + (yaml.length > 2000 ? "\n# ... truncated" : ""));
    if (!opts.write) {
      console.log("\n追加: --write で上書き保存");
    }
    return;
  }

  const path = join(getDataDir(), "plans", `yojitsu-${id}.yaml`);
  writeFileSync(path, yaml, "utf-8");
  console.log(`✓ Wrote v2 yojitsu to ${path}`);
}
