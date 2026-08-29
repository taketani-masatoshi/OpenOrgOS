import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../../../src/commands/skills.js";
import { listPermitOpeningBlockers } from "../../../../../../src/lib/permit-opening-gate.js";

export const MODULE_ID = "jp_minpaku";


function runMinpakuGateSkill(opts: SkillRunOptions): void {
  const blockers = listPermitOpeningBlockers().filter(
    (b) => b.module_id === "jp_minpaku" || b.module_id === "hospitality"
  );
  if (opts.json) {
    console.log(JSON.stringify({ blockers }, null, 2));
    return;
  }
  console.log("# 民泊 / 宿泊 許認可ゲート\n");
  if (!blockers.length) {
    console.log("✓ 関連ブロッカーなし");
    return;
  }
  for (const b of blockers) {
    console.log(`- ${b.title}`);
    console.log(`  ${b.detail}`);
  }
  process.exitCode = 1;
}

export const jp_minpakuCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("minpaku")
      .description("JP minpaku (住宅宿泊) — gate check (jp_minpaku)");

    cmd
      .command("gate")
      .description("Show G-01 blockers for jp_minpaku / hospitality permits")
      .option("--json", "JSON output")
      .action((opts: { json?: boolean }) => {
        const blockers = listPermitOpeningBlockers().filter(
          (b) => b.module_id === "jp_minpaku" || b.module_id === "hospitality"
        );
        if (opts.json) {
          console.log(JSON.stringify({ blockers }, null, 2));
          return;
        }
        console.log("# 民泊 / 宿泊 許認可ゲート\n");
        if (!blockers.length) {
          console.log("✓ 関連ブロッカーなし");
          return;
        }
        for (const b of blockers) {
          console.log(`- ${b.title}`);
          console.log(`  ${b.detail}`);
        }
        process.exitCode = 1;
      });
  },
  skillHandlers: {
    jp_minpaku_ops: runMinpakuGateSkill,
    jp_minpaku_gate: runMinpakuGateSkill,
  },
};
