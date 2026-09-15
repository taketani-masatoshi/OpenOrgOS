import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../../../src/commands/skills.js";
import {
  writeBooksPack,
  writeDeductionGateReport,
  writeFormBDraft,
  writeHandoffChecklist,
  writeKessanDraft,
} from "../../../../../../src/lib/finance/sole-proprietor-blue-return.js";

export const MODULE_ID = "jp_sole_proprietor_blue_return";

function parseYear(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) {
    throw new Error(`Invalid --year ${raw}`);
  }
  return n;
}

function runBooks(opts: { year?: string; json?: boolean }): void {
  const result = writeBooksPack(parseYear(opts.year));
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `✓ 複式帳簿パック ${result.paths.length} files · 期間内仕訳 ${result.period_entry_count} 件`,
  );
  for (const p of result.paths) console.log(`  ${p}`);
}

function runKessan(opts: { year?: string; json?: boolean }): void {
  const { path, kessan } = writeKessanDraft(parseYear(opts.year));
  if (opts.json) {
    console.log(JSON.stringify({ path, kessan }, null, 2));
    return;
  }
  console.log(`✓ 青色申告決算書（一般用）ドラフト → ${path}`);
  console.log(
    `  所得（控除前） ${kessan.income_before_blue_deduction_yen.toLocaleString("ja-JP")} · 控除 ${kessan.blue_deduction_yen.toLocaleString("ja-JP")} · 所得 ${kessan.business_income_yen.toLocaleString("ja-JP")}`,
  );
  for (const issue of kessan.issues) console.warn(`  ⚠ ${issue}`);
}

function runShinkokuB(opts: { year?: string; json?: boolean }): void {
  const { path, draft } = writeFormBDraft(parseYear(opts.year));
  if (opts.json) {
    console.log(JSON.stringify({ path, draft }, null, 2));
    return;
  }
  console.log(`✓ 確定申告書B ドラフト → ${path}`);
  console.log(
    `  課税所得 ${draft.taxable_income_yen.toLocaleString("ja-JP")} · 申告納税額 ${draft.tax_payable_yen.toLocaleString("ja-JP")}`,
  );
}

function runDeductionGate(opts: { year?: string; json?: boolean }): void {
  const { path, gate } = writeDeductionGateReport(parseYear(opts.year));
  if (opts.json) {
    console.log(JSON.stringify({ path, gate }, null, 2));
    return;
  }
  console.log(`✓ 控除ゲート → ${path}`);
  console.log(
    `  cap ${gate.eligible_cap_yen.toLocaleString("ja-JP")} · applied ${gate.applied_deduction_yen.toLocaleString("ja-JP")}`,
  );
  for (const n of gate.notes) console.log(`  - ${n}`);
}

function runHandoff(opts: { year?: string; json?: boolean }): void {
  const { path } = writeHandoffChecklist(parseYear(opts.year));
  if (opts.json) {
    console.log(JSON.stringify({ path }, null, 2));
    return;
  }
  console.log(`✓ 税理士 handoff → ${path}`);
}

export function runJpSolePropBlueReturnPackSkill(opts: SkillRunOptions): void {
  const year = opts.month?.slice(0, 4);
  runBooks({ year });
  console.log("");
  runKessan({ year });
  console.log("");
  runShinkokuB({ year });
  console.log("");
  runDeductionGate({ year });
  console.log("");
  runHandoff({ year });
}

export const jp_sole_proprietor_blue_returnCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("sole-prop-blue")
      .description("JP sole proprietor blue return — books · kessan · Form B (jp_sole_proprietor_blue_return)");

    cmd
      .command("books")
      .description("Write double-entry statutory books pack (Markdown)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => runBooks(opts));

    cmd
      .command("kessan")
      .description("Write blue return financial statement draft (一般用)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => runKessan(opts));

    cmd
      .command("shinkoku-b")
      .description("Write Form B amount draft (not e-Tax XML)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => runShinkokuB(opts));

    cmd
      .command("deduction-gate")
      .description("Assess 550k / 650k blue return special deduction eligibility")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => runDeductionGate(opts));

    cmd
      .command("handoff")
      .description("Tax advisor handoff checklist (submission is human)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => runHandoff(opts));
  },
  skillHandlers: {
    jp_sole_prop_blue_return_pack: runJpSolePropBlueReturnPackSkill,
  },
};
