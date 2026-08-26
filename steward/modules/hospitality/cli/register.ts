import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { currentDate, writeMarkdownReport } from "../../../../src/lib/utils.js";
import { checkOperationsRecords, formatRecordsCheck } from "./records-check.js";
import { formatSyncDerivedResult, runHospitalitySyncDerived } from "./sync-derived.js";

export const MODULE_ID = "hospitality";

function runRecordsCheckSkill(opts: SkillRunOptions): void {
  const r = checkOperationsRecords();
  const md = formatRecordsCheck(r);
  if (opts.output) {
    writeMarkdownReport("agent-summaries/operations", opts.output ?? `records-${currentDate()}.md`, md);
  } else {
    console.log(md);
  }
}

function runRevparSkill(_opts: SkillRunOptions): void {
  console.log("RevPAR skill — hospitality モジュール有効時は dashboard 宿泊セクションを参照");
  console.log("次: npm run orgos -- skills run dashboard");
}

function runSyncDerivedSkill(opts: SkillRunOptions): void {
  const write = Boolean(opts.write);
  const result = runHospitalitySyncDerived({ write, dryRun: !write });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatSyncDerivedResult(result));
}

export const hospitalityCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(_ctx) {
    // CLI は skills run records-check · revpar 経由
  },
  skillHandlers: {
    operations_records: runRecordsCheckSkill,
    revpar_analysis: runRevparSkill,
    hospitality_sync_derived: runSyncDerivedSkill,
  },
};
