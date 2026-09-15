import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../../../src/commands/skills.js";
import {
  writeBooksPack,
  writeDeductionGateReport,
  writeFormBDraft,
  writeHandoffChecklist,
  writeKessanDraft,
  loadBlueReturnIncomeDeductions,
  sumCappedIncomeDeductions,
} from "../../../../../../src/lib/finance/sole-proprietor-blue-return.js";
import {
  assessBlueReturnSetup,
  applyFilingEvidence,
  applySetupSideEffects,
  assessExpenseIntake,
  loadBlueReturnSetup,
  parseExpenseIntakeFromFile,
  parseSetupFromFile,
  saveBlueReturnSetup,
  upsertExpenseIntake,
  writeExpenseIntakeClarifyReport,
  writeSetupClarifyReport,
} from "../../../../../../src/lib/finance/sole-proprietor-clarify.js";
import { applyExpenseIntakeSideEffects } from "../../../../../../src/lib/finance/sole-proprietor-expense-apply.js";
import { postSolePropDepreciationYear } from "../../../../../../src/lib/finance/sole-prop-depreciation.js";
import { postPrepaidYearTransfers } from "../../../../../../src/lib/finance/sole-prop-prepaid-transfer.js";

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

function runSetupStatus(opts: { year?: string; json?: boolean }): void {
  const year = parseYear(opts.year);
  const assessment = assessBlueReturnSetup(loadBlueReturnSetup());
  if (opts.json) {
    console.log(JSON.stringify({ year, ...assessment }, null, 2));
    return;
  }
  console.log(`setup ready: ${assessment.ready ? "yes" : "no"}`);
  if (assessment.file_missing) console.log("  (blue-return-setup.yaml 未作成)");
  for (const q of assessment.clarify_questions) {
    console.log(`  - [${q.id}] ${q.prompt}`);
  }
}

function runSetupClarify(opts: { year?: string; json?: boolean }): void {
  const { path, assessment } = writeSetupClarifyReport(parseYear(opts.year));
  if (opts.json) {
    console.log(JSON.stringify({ path, assessment }, null, 2));
    return;
  }
  console.log(`✓ setup clarify → ${path}`);
  console.log(`  ready: ${assessment.ready ? "yes" : "no"} · questions ${assessment.clarify_questions.length}`);
  assessment.clarify_questions.forEach((q, i) => {
    console.log(`  ${i + 1}. [${q.id}] ${q.prompt}`);
  });
}

function runSetupApply(opts: { from: string; json?: boolean }): void {
  const setup = parseSetupFromFile(opts.from);
  const assessment = assessBlueReturnSetup(setup);
  if (!assessment.ready) {
    console.error("setup 未充足 — clarify の質問に答えてから apply してください:");
    for (const q of assessment.clarify_questions) {
      console.error(`  - [${q.id}] ${q.prompt}`);
    }
    process.exitCode = 1;
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, assessment }, null, 2));
    }
    return;
  }
  const saved = saveBlueReturnSetup(setup);
  const touched = applySetupSideEffects(setup);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, saved, touched, assessment }, null, 2));
    return;
  }
  console.log(`✓ setup saved → ${saved}`);
  for (const t of touched) console.log(`  synced ${t}`);
}

function runExpenseIntakeClarify(opts: {
  amount: string;
  year?: string;
  id?: string;
  json?: boolean;
}): void {
  const amountYen = Number.parseInt(opts.amount, 10);
  if (!Number.isFinite(amountYen) || amountYen <= 0) {
    throw new Error(`Invalid --amount ${opts.amount}`);
  }
  const { path, assessment } = writeExpenseIntakeClarifyReport({
    calendarYear: parseYear(opts.year),
    amountYen,
    intakeId: opts.id,
  });
  if (opts.json) {
    console.log(JSON.stringify({ path, assessment }, null, 2));
    return;
  }
  console.log(`✓ expense-intake clarify → ${path}`);
  console.log(
    `  band: ${assessment.amount_band} · complete: ${assessment.complete ? "yes" : "no"} · questions ${assessment.clarify_questions.length}`,
  );
  assessment.clarify_questions.forEach((q, i) => {
    console.log(`  ${i + 1}. [${q.id}] ${q.prompt}`);
  });
}

function runExpenseIntakeApply(opts: {
  from: string;
  json?: boolean;
  noJournal?: boolean;
}): void {
  const intake = parseExpenseIntakeFromFile(opts.from);
  const setup = loadBlueReturnSetup();
  const assessment = assessExpenseIntake(intake, setup);
  if (!assessment.complete) {
    console.error("intake 未充足 — clarify の質問に答えてから apply してください:");
    for (const q of assessment.clarify_questions) {
      console.error(`  - [${q.id}] ${q.prompt}`);
    }
    process.exitCode = 1;
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, assessment }, null, 2));
    }
    return;
  }
  const complete = { ...intake, status: "complete" as const, amount_band: assessment.amount_band };
  const saved = upsertExpenseIntake(complete);
  const side = applyExpenseIntakeSideEffects(complete, {
    postJournal: !opts.noJournal,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, saved, intake: complete, side }, null, 2));
    return;
  }
  console.log(`✓ expense intake saved → ${saved} (${complete.intake_id})`);
  for (const n of side.notes) console.log(`  ${n}`);
}

function runFilingEvidence(opts: {
  year?: string;
  etaxAt?: string;
  denshiAt?: string;
  notes?: string;
  json?: boolean;
}): void {
  const year = parseYear(opts.year) ?? new Date().getFullYear();
  if (!opts.etaxAt && !opts.denshiAt) {
    throw new Error("--etax-at または --denshi-at が必要です");
  }
  const path = applyFilingEvidence({
    calendarYear: year,
    etaxSubmittedAt: opts.etaxAt,
    denshiYuryoNotifiedAt: opts.denshiAt,
    notes: opts.notes,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, path }, null, 2));
    return;
  }
  console.log(`✓ filing evidence → ${path}`);
}

export function runJpSolePropBlueReturnPackSkill(opts: SkillRunOptions): void {
  const year = opts.month?.slice(0, 4);
  runSetupClarify({ year });
  console.log("");
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
      .description(
        "JP sole proprietor blue return — setup · expense-intake · books · kessan · Form B",
      );

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

    const setup = cmd
      .command("setup")
      .description("Initial blue-return questionnaire (開業・控除・消費税・按分・減価償却方針)");

    setup
      .command("status")
      .description("Show whether blue-return-setup.yaml is ready")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => runSetupStatus(opts));

    setup
      .command("clarify")
      .description("Write numbered setup questions (do not treat filing as complete while open)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => runSetupClarify(opts));

    setup
      .command("apply")
      .description("Validate and save setup YAML; sync filing/allocation/tax-profile where safe")
      .requiredOption("--from <path>", "Path to blue-return-setup.yaml answers")
      .option("--json")
      .action((opts: { from: string; json?: boolean }) => runSetupApply(opts));

    const expense = cmd
      .command("expense-intake")
      .description("Per-expense clarify before booking (家事按分・取得価額帯・証憑)");

    expense
      .command("clarify")
      .description("Show questions for an expense amount band")
      .requiredOption("--amount <yen>", "Expense amount (integer yen)")
      .option("--year <YYYY>", "Calendar year")
      .option("--id <intake_id>", "Intake id")
      .option("--json")
      .action(
        (opts: { amount: string; year?: string; id?: string; json?: boolean }) =>
          runExpenseIntakeClarify(opts),
      );

    expense
      .command("apply")
      .description(
        "Validate, upsert intake, and post journal / fixed-asset / allocation side effects",
      )
      .requiredOption("--from <path>", "Path to a single intake YAML object")
      .option("--no-journal", "Skip journal append (record intake only)")
      .option("--json")
      .action((opts: { from: string; json?: boolean; noJournal?: boolean }) =>
        runExpenseIntakeApply(opts),
      );

    const filing = cmd
      .command("filing")
      .description("65万円証跡（e-Tax / 優良電子帳簿）— OrgOS は送信しない");

    filing
      .command("evidence")
      .description("Write etax_submitted_at or denshi_yuryo_notified_at to blue-return-filing.yaml")
      .option("--year <YYYY>", "Calendar year")
      .option("--etax-at <ISO>", "e-Tax submit timestamp (human attestation)")
      .option("--denshi-at <ISO>", "優良電子帳簿 notified_at")
      .option("--notes <text>")
      .option("--json")
      .action(
        (opts: {
          year?: string;
          etaxAt?: string;
          denshiAt?: string;
          notes?: string;
          json?: boolean;
        }) => runFilingEvidence(opts),
      );

    const depr = cmd
      .command("depreciation")
      .description("Lump-sum 1/3 and ordinary depreciation posts for calendar year");

    depr
      .command("post-year")
      .description("Post JE-LUMP-* year amortizations (+ ordinary Dec wrap)")
      .option("--year <YYYY>", "Calendar year")
      .option("--asset-id <ASSET-nnn>", "Limit lump-sum to one asset")
      .option("--json")
      .action((opts: { year?: string; assetId?: string; json?: boolean }) => {
        const year = parseYear(opts.year) ?? new Date().getFullYear();
        const result = postSolePropDepreciationYear({
          calendarYear: year,
          assetId: opts.assetId,
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(
          `✓ lump posted ${result.lump.posted.length} · skipped ${result.lump.skipped.length}`,
        );
        for (const id of result.lump.posted) console.log(`  ${id}`);
        console.log(`✓ ordinary posted ${result.ordinary.posted.length}`);
        for (const n of result.ordinary.notes) console.log(`  ${n}`);
      });

    const prepaidCmd = cmd
      .command("prepaid")
      .description("Prepaid expense (1180) year-end recognition");

    prepaidCmd
      .command("transfer-year")
      .description(
        "Post JE-PRE-* year-end transfers (Dr expense / Cr 1180). Intake posts 1180; this recognizes expense — do not expense twice.",
      )
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const year = parseYear(opts.year) ?? new Date().getFullYear();
        const result = postPrepaidYearTransfers({ calendarYear: year });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(
          `✓ prepaid transfer posted ${result.posted.length} · skipped ${result.skipped.length}`,
        );
        for (const id of result.posted) console.log(`  ${id}`);
        for (const id of result.skipped) console.log(`  skip ${id}`);
      });

    const deductionsCmd = cmd
      .command("deductions")
      .description("Form B income deductions (hand-entered YAML)");

    deductionsCmd
      .command("status")
      .description("Show income-deduction YAML status for Form B")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const year = parseYear(opts.year) ?? new Date().getFullYear();
        const { deductions, missing } = loadBlueReturnIncomeDeductions(year);
        const capped = deductions
          ? sumCappedIncomeDeductions(deductions)
          : { total: 0, lines: [] };
        if (opts.json) {
          console.log(JSON.stringify({ year, missing, deductions, capped }, null, 2));
          return;
        }
        console.log(
          `deductions ${missing ? "missing/mismatch" : "ok"} · year ${year} · capped total ${capped.total.toLocaleString("ja-JP")}`,
        );
        for (const l of capped.lines) {
          console.log(`  ${l.label}: ${l.amount_yen.toLocaleString("ja-JP")}`);
        }
      });
  },
  skillHandlers: {
    jp_sole_prop_blue_return_pack: runJpSolePropBlueReturnPackSkill,
  },
};
