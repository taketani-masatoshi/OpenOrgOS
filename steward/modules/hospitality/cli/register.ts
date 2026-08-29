import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { currentDate, writeMarkdownReport } from "../../../../src/lib/utils.js";
import { checkOperationsRecords, formatRecordsCheck } from "./records-check.js";
import { registerHospitalityCommands } from "./commands.js";
import { computeStayMetrics } from "./ops-lib.js";
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

function runRevparSkill(opts: SkillRunOptions): void {
  const period = opts.period || currentDate().slice(0, 7);
  const metrics = computeStayMetrics(period);
  const md = [
    `# RevPAR ${metrics.period}`,
    "",
    `- 物件: ${metrics.property_id}`,
    `- 稼働: ${(metrics.occupancy * 100).toFixed(1)}%（${metrics.occupied_nights}/${metrics.available_nights} 泊）`,
    `- ADR: ¥${Math.round(metrics.adr)}`,
    `- RevPAR: ¥${Math.round(metrics.revpar)}`,
    `- 売上: ¥${metrics.revenue_jpy}（${metrics.stay_count} 件）`,
    "",
  ].join("\n");
  if (opts.output) {
    writeMarkdownReport("agent-summaries/hospitality", opts.output ?? `revpar-${currentDate()}.md`, md);
  } else {
    console.log(md);
  }
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
  register(ctx) {
    registerHospitalityCommands(ctx.operationsCmd);
  },
  skillHandlers: {
    operations_records: runRecordsCheckSkill,
    revpar_analysis: runRevparSkill,
    hospitality_sync_derived: runSyncDerivedSkill,
  },
};
