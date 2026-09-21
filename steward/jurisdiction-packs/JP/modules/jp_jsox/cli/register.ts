import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../../../src/commands/skills.js";
import {
  formatJsoxStatus,
  jsoxEvaluate,
  jsoxGaps,
  loadJsoxItgc,
  loadJsoxProcesses,
  loadJsoxScope,
} from "../../../../../../src/lib/jsox.js";
import {
  renderJsoxEvaluateReport,
  renderJsoxStatusReport,
} from "../../../../../../src/lib/propose/jsox.js";

export const MODULE_ID = "jp_jsox";

function printGaps(opts: SkillRunOptions): void {
  if (opts.json) {
    console.log(JSON.stringify(renderJsoxStatusReport(), null, 2));
    return;
  }
  const gaps = jsoxGaps();
  console.log("# J-SOX gaps\n");
  if (gaps.length === 0) console.log("ギャップなし");
  else for (const g of gaps) console.log(`- ${g}`);
}

function printScope(opts: SkillRunOptions): void {
  const scope = loadJsoxScope();
  const processes = loadJsoxProcesses();
  const itgc = loadJsoxItgc();
  if (opts.json) {
    console.log(JSON.stringify({ scope, processes, itgc }, null, 2));
    return;
  }
  console.log("# J-SOX scope\n");
  for (const a of scope.areas) console.log(`- ${a.id} · ${a.title} · ${a.in_scope ? "in scope" : "out"}`);
  console.log("\n## processes");
  for (const p of processes.processes) console.log(`- ${p.id} · ${p.module}`);
  console.log("\n## ITGC");
  for (const c of itgc.checks) console.log(`- ${c.id} · ${c.title}`);
}

function printEvaluate(opts: SkillRunOptions & { operatorId?: string }): void {
  const operatorId = opts.operatorId ?? "unknown";
  if (opts.json) {
    console.log(JSON.stringify(renderJsoxEvaluateReport(operatorId), null, 2));
    return;
  }
  const result = jsoxEvaluate(operatorId);
  if (result.refused) {
    console.log(`拒否: ${result.refused}`);
  } else {
    console.log(result.ok ? "評価項目を閉じられる状態です（署名は iso audit sign）" : "ギャップが残っています");
  }
  for (const g of result.gaps) console.log(`- ${g}`);
}

export const jp_jsoxCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("jsox")
      .description("財務報告内部統制の内部評価（報告書・EDINET は出さない）");

    cmd
      .command("status")
      .description("評価範囲と記録の概況")
      .option("--json", "JSON ProposeReport")
      .option("--report", "Alias for --json ProposeReport")
      .action((opts: { json?: boolean; report?: boolean }) => {
        if (opts.json || opts.report) console.log(JSON.stringify(renderJsoxStatusReport(), null, 2));
        else console.log(formatJsoxStatus());
      });

    cmd
      .command("scope")
      .description("評価範囲・プロセス・ITGC")
      .option("--json", "JSON")
      .action((opts: { json?: boolean }) => printScope(opts));

    cmd
      .command("gaps")
      .description("評価ギャップ")
      .option("--json", "JSON ProposeReport")
      .option("--report", "Alias for --json ProposeReport")
      .action((opts: { json?: boolean; report?: boolean }) =>
        printGaps({ ...opts, json: Boolean(opts.json || opts.report) }),
      );

    cmd
      .command("evaluate")
      .description("評価を実施（finance の自己評価は拒否）")
      .option("--operator-id <id>", "実施者")
      .option("--json", "JSON ProposeReport")
      .option("--report", "Alias for --json ProposeReport")
      .action((opts: { json?: boolean; report?: boolean; operatorId?: string }) =>
        printEvaluate({ ...opts, json: Boolean(opts.json || opts.report) }),
      );
  },
  skillHandlers: {
    jsox_scope: (opts) => printScope(opts),
    jsox_gaps: (opts) => printGaps(opts),
    jsox_evaluate: (opts) => printEvaluate(opts),
  },
};
