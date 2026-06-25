import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { currentDate, writeMarkdownReport } from "../../../../src/lib/utils.js";
import { checkOperationsRecords, formatRecordsCheck } from "./records-check.js";

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
  console.log("次: npm run steward -- skills run dashboard");
}

export const hospitalityCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(_ctx) {
    // CLI は skills run records-check · revpar 経由
  },
  skillHandlers: {
    "records-check": runRecordsCheckSkill,
    revpar: runRevparSkill,
  },
};
