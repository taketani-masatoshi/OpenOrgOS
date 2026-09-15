/**
 * Sole-prop blue return — setup / expense-intake clarify (permit-app style).
 * Answers live in YAML; kessan/handoff surface gaps as warnings.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  blueReturnSetupSchema,
  type BlueReturnSetup,
  type BlueReturnDepreciationPolicy,
} from "../../../schemas/finance/blue-return-setup.js";
import {
  blueReturnIncomeDeductionsSchema,
} from "../../../schemas/finance/blue-return-income-deductions.js";
import {
  blueReturnExpenseIntakeSchema,
  blueReturnExpenseIntakesFileSchema,
  type BlueReturnAmountBand,
  type BlueReturnExpenseIntake,
  type BlueReturnExpenseIntakesFile,
} from "../../../schemas/finance/blue-return-expense-intake.js";
import { getDataDir, getDocsDir, readYamlFile, writeTrackedFile, writeYamlFile } from "../utils.js";
import { loadTaxProfile } from "../data.js";

/** Avoid circular import with sole-proprietor-blue-return.ts */
function yearContext(calendarYear?: number): { calendar_year: number; year_label: string } {
  const year = calendarYear ?? new Date().getFullYear();
  return { calendar_year: year, year_label: `令和${year - 2018}年分` };
}

export type ClarifyQuestion = {
  id: string;
  prompt: string;
  hint?: string;
};

export type SetupAssessment = {
  ready: boolean;
  missing: string[];
  clarify_questions: ClarifyQuestion[];
  /** Does not affect ready — e.g. Form B income deductions YAML. */
  optional_questions: ClarifyQuestion[];
  setup: BlueReturnSetup | null;
  file_missing: boolean;
};

export type ExpenseIntakeAssessment = {
  complete: boolean;
  missing: string[];
  clarify_questions: ClarifyQuestion[];
  amount_band: BlueReturnAmountBand;
  intake: Partial<BlueReturnExpenseIntake> & { amount_yen: number };
};

const SETUP_PATH_REL = "finance/blue-return-setup.yaml";

export function blueReturnSetupPath(): string {
  return join(getDataDir(), SETUP_PATH_REL);
}

export function blueReturnExpenseIntakesPath(): string {
  return join(getDataDir(), "finance", "blue-return-expense-intakes.yaml");
}

export function classifyAmountBand(amountYen: number): BlueReturnAmountBand {
  if (amountYen < 100_000) return "under_100k";
  if (amountYen < 200_000) return "from_100k_to_200k";
  if (amountYen < 300_000) return "from_200k_to_300k";
  return "from_300k";
}

export function loadBlueReturnSetup(): BlueReturnSetup | null {
  const path = blueReturnSetupPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, blueReturnSetupSchema);
}

export function saveBlueReturnSetup(setup: BlueReturnSetup): string {
  const path = blueReturnSetupPath();
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(path, blueReturnSetupSchema.parse(setup));
  return path;
}

export function loadBlueReturnExpenseIntakes(): BlueReturnExpenseIntakesFile {
  const path = blueReturnExpenseIntakesPath();
  if (!existsSync(path)) {
    return blueReturnExpenseIntakesFileSchema.parse({ version: 1, intakes: [] });
  }
  return readYamlFile(path, blueReturnExpenseIntakesFileSchema);
}

export function saveBlueReturnExpenseIntakes(file: BlueReturnExpenseIntakesFile): string {
  const path = blueReturnExpenseIntakesPath();
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(path, blueReturnExpenseIntakesFileSchema.parse(file));
  return path;
}

export function assessBlueReturnSetup(setup: BlueReturnSetup | null): SetupAssessment {
  const missing: string[] = [];
  const clarify_questions: ClarifyQuestion[] = [];
  const optional_questions: ClarifyQuestion[] = [];

  const ask = (id: string, prompt: string, hint?: string) => {
    missing.push(id);
    clarify_questions.push({ id, prompt, hint });
  };

  if (!setup) {
    ask(
      "setup_file",
      "初期セットアップ YAML がありません。回答を記入して setup apply してください。",
      SETUP_PATH_REL,
    );
    return {
      ready: false,
      missing,
      clarify_questions,
      optional_questions,
      setup: null,
      file_missing: true,
    };
  }

  if (!setup.opened_on) {
    ask("opened_on", "開業日はいつですか？（YYYY-MM-DD）");
  }
  if (setup.blue_return_approved === undefined) {
    ask(
      "blue_return_approved",
      "青色申告の承認はありますか？（true/false）。申請中なら applied_on も記入。",
    );
  }
  if (setup.blue_return_approved === false && !setup.blue_return_applied_on) {
    ask("blue_return_applied_on", "青色申告承認申請の提出日はいつですか？");
  }
  if (!setup.calendar_year) {
    ask("calendar_year", "対象の暦年（青色申告の年分）は何年ですか？");
  }
  if (!setup.books_start_month) {
    ask("books_start_month", "記帳開始月はいつですか？（YYYY-MM）");
  }
  if (!setup.deduction_target) {
    ask(
      "deduction_target",
      "青色申告特別控除の目標は 55万円 と 65万円のどちらですか？",
      "550000 | 650000",
    );
  }
  if (
    setup.deduction_target === "650000" &&
    (!setup.deduction_path || setup.deduction_path === "unset")
  ) {
    ask(
      "deduction_path",
      "65万円を目指す場合、e-Tax 期限内提出と優良電子帳簿＋届出のどちらですか？",
      "etax | denshi_yuryo",
    );
  }
  if (!setup.consumption) {
    ask(
      "consumption",
      "消費税は免税・課税のどちらですか？課税なら本則/簡易、インボイス登録の有無も教えてください。",
    );
  } else {
    if (!setup.consumption.status?.trim()) {
      ask("consumption.status", "消費税の status（免税事業者 / 課税事業者 等）を記入してください。");
    }
    if (setup.consumption.invoice_registered === undefined) {
      ask("consumption.invoice_registered", "適格請求書発行事業者の登録はありますか？");
    }
    if (
      setup.consumption.invoice_registered === true &&
      !setup.consumption.invoice_registration_number?.trim()
    ) {
      ask(
        "consumption.invoice_registration_number",
        "インボイス登録番号（T+13桁）を記入してください。",
      );
    }
  }
  if (!setup.home_office) {
    ask(
      "home_office",
      "自宅兼事務所はありますか？ある場合、按分方法（床面積/時間/その他）と事業割合(%)を教えてください。",
    );
  } else if (setup.home_office.has_home_office) {
    if (!setup.home_office.allocation_method || setup.home_office.allocation_method === "n_a") {
      ask("home_office.allocation_method", "家事按分の方法は床面積・時間・その他のどれですか？");
    }
    if (setup.home_office.business_pct === undefined) {
      ask("home_office.business_pct", "自宅兼事務所の事業割合(%)はいくつですか？");
    }
  }
  if (setup.accounts_separated === undefined) {
    ask("accounts_separated", "事業用の口座・カードは家計と分離していますか？（true/false）");
  }
  if (setup.has_blue_special_family_employees === undefined) {
    ask("has_blue_special_family_employees", "青色事業専従者はいますか？（true/false）");
  }
  if (!setup.depreciation_policy) {
    ask(
      "depreciation_policy",
      "減価償却の既定方針はどれですか？",
      "ordinary | immediate_under_100k | lump_sum_100_200k | sme_under_300k",
    );
  }
  if (setup.has_withholding_outsourcing === undefined) {
    ask("has_withholding_outsourcing", "源泉徴収対象の外注報酬はありますか？（true/false）");
  }
  if (!setup.tax_advisor_handoff) {
    ask(
      "tax_advisor_handoff",
      "税理士への引き渡し期限（deadline）と担当（owner）を教えてください。",
    );
  } else {
    if (!setup.tax_advisor_handoff.deadline) {
      ask("tax_advisor_handoff.deadline", "税理士 handoff の期限日は？");
    }
    if (!setup.tax_advisor_handoff.owner?.trim()) {
      ask("tax_advisor_handoff.owner", "税理士 handoff の担当名は？");
    }
  }

  const deductionsPath = join(getDataDir(), "finance", "blue-return-income-deductions.yaml");
  let deductionsOptional = !existsSync(deductionsPath);
  if (!deductionsOptional && setup.calendar_year) {
    try {
      const raw = readYamlFile(deductionsPath, blueReturnIncomeDeductionsSchema);
      if (raw.calendar_year !== setup.calendar_year) {
        deductionsOptional = true;
      }
    } catch {
      deductionsOptional = true;
    }
  }
  if (deductionsOptional) {
    optional_questions.push({
      id: "income_deductions_yaml",
      prompt:
        "所得控除（社会保険・生命保険等）を Form B に反映する場合は blue-return-income-deductions.yaml を対象年で埋めてください（任意・ready には影響しません）。",
      hint: "data/finance/blue-return-income-deductions.yaml",
    });
  }

  return {
    ready: missing.length === 0,
    missing,
    clarify_questions,
    optional_questions,
    setup,
    file_missing: false,
  };
}

function policyAllowsBand(
  policy: BlueReturnDepreciationPolicy | undefined,
  band: BlueReturnAmountBand,
  choice: string | undefined,
): ClarifyQuestion | null {
  if (!choice || choice === "n_a") return null;
  if (band === "under_100k" && choice === "ordinary_fixed_asset") {
    return {
      id: "depreciation_choice",
      prompt:
        "10万円未満ですが固定資産として処理しますか？消耗品費（expense）の方が一般的です。確認してください。",
    };
  }
  if (band === "from_100k_to_200k" && choice === "expense" && policy !== "immediate_under_100k") {
    return {
      id: "depreciation_choice",
      prompt:
        "10〜20万円帯です。一括償却（lump_sum）または通常資産を選んでください（即費用は原則10万未満）。",
    };
  }
  if (band === "from_200k_to_300k" && choice === "expense") {
    return {
      id: "depreciation_choice",
      prompt: "20〜30万円帯です。中小特例（sme_special）か通常固定資産を選んでください。",
      hint: policy === "sme_under_300k" ? "setup 方針は sme_under_300k" : undefined,
    };
  }
  if (
    band === "from_300k" &&
    (choice === "expense" || choice === "lump_sum" || choice === "sme_special")
  ) {
    return {
      id: "depreciation_choice",
      prompt: "30万円以上です。通常の固定資産（ordinary_fixed_asset）を選んでください。",
    };
  }
  return null;
}

export function assessExpenseIntake(
  partial: Partial<BlueReturnExpenseIntake> & { amount_yen: number },
  setup: BlueReturnSetup | null,
): ExpenseIntakeAssessment {
  const missing: string[] = [];
  const clarify_questions: ClarifyQuestion[] = [];
  const amount_band = partial.amount_band ?? classifyAmountBand(partial.amount_yen);

  const ask = (id: string, prompt: string, hint?: string) => {
    missing.push(id);
    clarify_questions.push({ id, prompt, hint });
  };

  if (partial.business_use === undefined) {
    ask("business_use", "この支出は事業専用ですか、家事共用ですか？", "business_only | shared");
  } else if (partial.business_use === "shared") {
    if (partial.business_pct === undefined) {
      ask("business_pct", "家事共用の場合、事業割合(%)はいくつですか？");
    }
    if (partial.owner_draw_split_done === undefined) {
      ask(
        "owner_draw_split_done",
        "家事分は仕訳で事業主貸に分離済みですか？（true/false）。未分離なら allocation_write_mode も指定。",
      );
    }
  }

  if (partial.depreciation_choice === undefined) {
    const hintByBand: Record<BlueReturnAmountBand, string> = {
      under_100k: "候補: expense（消耗品）",
      from_100k_to_200k: "候補: lump_sum | ordinary_fixed_asset",
      from_200k_to_300k: "候補: sme_special | ordinary_fixed_asset",
      from_300k: "候補: ordinary_fixed_asset",
    };
    ask(
      "depreciation_choice",
      `取得価額帯は ${amount_band} です。減価償却・費用化の選択は？`,
      hintByBand[amount_band],
    );
  } else {
    const conflict = policyAllowsBand(
      setup?.depreciation_policy,
      amount_band,
      partial.depreciation_choice,
    );
    if (conflict) {
      missing.push(conflict.id);
      clarify_questions.push(conflict);
    }
  }

  if (!partial.occurred_on) {
    ask("occurred_on", "費用の発生日（取引日）はいつですか？（YYYY-MM-DD）");
  }
  if (!partial.paid_on) {
    ask("paid_on", "支払日はいつですか？（YYYY-MM-DD）");
  }
  if (
    partial.depreciation_choice === "ordinary_fixed_asset" ||
    partial.depreciation_choice === "lump_sum" ||
    partial.depreciation_choice === "sme_special"
  ) {
    if (!partial.placed_in_service_month) {
      ask("placed_in_service_month", "事業供用開始月はいつですか？（YYYY-MM）");
    }
  }

  if (!partial.expense_line && !partial.account_code) {
    ask("expense_line", "青色申告決算書の経費区分（または account_code 4桁）はどれですか？");
  }

  if (partial.evidence_refs === undefined || partial.evidence_refs.length === 0) {
    ask(
      "evidence_refs",
      "証憑（領収書・請求書パス等）はありますか？ evidence_refs に列挙してください。",
    );
  }
  if (partial.invoice_qualified === undefined) {
    ask("invoice_qualified", "適格請求書（インボイス）に該当しますか？（true/false）");
  }
  if (partial.withholding_applicable === undefined) {
    ask("withholding_applicable", "源泉徴収の対象ですか？（報酬・料金等）");
  }
  if (partial.bundle_or_split_purchase === undefined) {
    ask(
      "bundle_or_split_purchase",
      "同一資産の分割購入・セット購入の可能性がありますか？（特例判定用・true/false）",
    );
  }
  if (partial.repair_vs_capex === undefined) {
    ask("repair_vs_capex", "修繕費ですか、資本的支出ですか？", "repair | capex | unclear");
  }
  if (partial.timing === undefined) {
    ask("timing", "当期費用・前払・未払のどれですか？", "current_expense | prepaid | accrued");
  }
  if (partial.business_use === "shared" && partial.allocation_write_mode === undefined) {
    ask(
      "allocation_write_mode",
      "按分は allocation YAML を更新しますか、仕訳側で事業分のみにしますか？",
      "update_yaml | journal_business_only",
    );
  }

  return {
    complete: missing.length === 0,
    missing,
    clarify_questions,
    amount_band,
    intake: { ...partial, amount_band },
  };
}

export function collectSetupGateWarnings(calendarYear?: number): string[] {
  const year = yearContext(calendarYear).calendar_year;
  const setup = loadBlueReturnSetup();
  const assessment = assessBlueReturnSetup(setup);
  const warnings: string[] = [];
  if (assessment.file_missing) {
    warnings.push(
      `setup 未作成: orgos operations sole-prop-blue setup clarify --year ${year}`,
    );
    return warnings;
  }
  if (!assessment.ready) {
    warnings.push(
      `setup 未充足 (${assessment.missing.length} 項目): sole-prop-blue setup clarify --year ${year}`,
    );
    for (const q of assessment.clarify_questions.slice(0, 5)) {
      warnings.push(`  Q:${q.id} ${q.prompt}`);
    }
    if (assessment.clarify_questions.length > 5) {
      warnings.push(`  …他 ${assessment.clarify_questions.length - 5} 問`);
    }
  } else if (setup && setup.calendar_year !== year) {
    warnings.push(`setup.calendar_year=${setup.calendar_year} が要求年 ${year} と不一致`);
  }

  const intakes = loadBlueReturnExpenseIntakes();
  const incomplete = intakes.intakes.filter((i) => i.status !== "complete");
  if (incomplete.length > 0) {
    warnings.push(
      `未完了の支出 intake ${incomplete.length} 件: sole-prop-blue expense-intake clarify`,
    );
  }
  return warnings;
}

export function writeSetupClarifyReport(calendarYear?: number): {
  path: string;
  assessment: SetupAssessment;
} {
  const ctx = yearContext(calendarYear);
  const setup = loadBlueReturnSetup();
  const assessment = assessBlueReturnSetup(setup);
  const lines = [
    `# 青色申告 初期セットアップ確認 — ${ctx.year_label}`,
    "",
    `ready: **${assessment.ready ? "はい" : "いいえ"}**`,
    `ファイル: \`data/finance/blue-return-setup.yaml\`${assessment.file_missing ? "（未作成）" : ""}`,
    "",
    "## 確認質問",
    "",
  ];
  if (assessment.clarify_questions.length === 0) {
    lines.push("未充足項目なし。");
  } else {
    assessment.clarify_questions.forEach((q, i) => {
      lines.push(`${i + 1}. **${q.id}** — ${q.prompt}`);
      if (q.hint) lines.push(`   - hint: \`${q.hint}\``);
    });
  }
  lines.push("", "## 任意（ready 非低下）", "");
  if (assessment.optional_questions.length === 0) {
    lines.push("任意項目なし。");
  } else {
    assessment.optional_questions.forEach((q, i) => {
      lines.push(`${i + 1}. **${q.id}** — ${q.prompt}`);
      if (q.hint) lines.push(`   - hint: \`${q.hint}\``);
    });
  }
  lines.push(
    "",
    "## CLI",
    "",
    "```bash",
    `orgos operations sole-prop-blue setup clarify --year ${ctx.calendar_year}`,
    "orgos operations sole-prop-blue setup apply --from data/finance/blue-return-setup.yaml",
    "```",
  );
  const dir = join(getDocsDir(), "finance", "blue-return", String(ctx.calendar_year));
  mkdirSync(dir, { recursive: true });
  const path = writeTrackedFile(join(dir, "setup-clarify.md"), lines.join("\n"));
  return { path, assessment };
}

export function writeExpenseIntakeClarifyReport(input: {
  calendarYear?: number;
  amountYen: number;
  intakeId?: string;
  partial?: Partial<BlueReturnExpenseIntake>;
}): { path: string; assessment: ExpenseIntakeAssessment } {
  const ctx = yearContext(input.calendarYear);
  const setup = loadBlueReturnSetup();
  const partial = {
    amount_yen: input.amountYen,
    intake_id: input.intakeId ?? `EI-${ctx.calendar_year}-DRAFT`,
    reported_at: new Date().toISOString(),
    tax_inclusive: true as const,
    ...input.partial,
  };
  const assessment = assessExpenseIntake(partial, setup);
  const lines = [
    `# 支出計上 確認質問 — ${ctx.year_label}`,
    "",
    `金額: ${input.amountYen.toLocaleString("ja-JP")} 円 · 帯: **${assessment.amount_band}**`,
    `complete: **${assessment.complete ? "はい" : "いいえ"}**`,
    "",
    "## 確認質問",
    "",
  ];
  if (assessment.clarify_questions.length === 0) {
    lines.push("未充足項目なし。intake を complete にして apply 可能。");
  } else {
    assessment.clarify_questions.forEach((q, i) => {
      lines.push(`${i + 1}. **${q.id}** — ${q.prompt}`);
      if (q.hint) lines.push(`   - hint: \`${q.hint}\``);
    });
  }
  lines.push(
    "",
    "## CLI",
    "",
    "```bash",
    `orgos operations sole-prop-blue expense-intake clarify --amount ${input.amountYen}`,
    "orgos operations sole-prop-blue expense-intake apply --from path/to/intake.yaml",
    "```",
  );
  const dir = join(getDocsDir(), "finance", "blue-return", String(ctx.calendar_year));
  mkdirSync(dir, { recursive: true });
  const path = writeTrackedFile(join(dir, "expense-intake-clarify.md"), lines.join("\n"));
  return { path, assessment };
}

/** Propagate setup answers into related YAML where safe. */
export function applySetupSideEffects(setup: BlueReturnSetup): string[] {
  const touched: string[] = [];
  const financeDir = join(getDataDir(), "finance");
  mkdirSync(financeDir, { recursive: true });

  const filingPath = join(financeDir, "blue-return-filing.yaml");
  const filing = existsSync(filingPath)
    ? (YAML.parse(readFileSync(filingPath, "utf-8")) as Record<string, unknown>)
    : { version: 1 };
  filing.calendar_year = setup.calendar_year;
  const notes: string[] = [];
  if (setup.deduction_target) {
    notes.push(`目標控除: ${setup.deduction_target} 円`);
  }
  if (setup.deduction_path && setup.deduction_path !== "unset") {
    notes.push(`65万経路: ${setup.deduction_path}（証跡日時は提出後に記入）`);
  }
  if (notes.length) {
    filing.notes = [typeof filing.notes === "string" ? filing.notes : "", ...notes]
      .filter(Boolean)
      .join("\n");
  }
  writeYamlFile(filingPath, filing);
  touched.push(filingPath);

  if (setup.home_office?.has_home_office && setup.home_office.business_pct !== undefined) {
    const allocPath = join(financeDir, "blue-return-allocation.yaml");
    const alloc = existsSync(allocPath)
      ? (YAML.parse(readFileSync(allocPath, "utf-8")) as Record<string, unknown>)
      : { version: 1, by_account: {}, by_entry: {} };
    alloc.calendar_year = setup.calendar_year;
    alloc.default_business_pct = setup.home_office.business_pct;
    alloc.notes = `home_office ${setup.home_office.allocation_method ?? "—"} ${setup.home_office.business_pct}% (from blue-return-setup)`;
    writeYamlFile(allocPath, alloc);
    touched.push(allocPath);
  }

  if (setup.consumption) {
    try {
      const profile = loadTaxProfile() as Record<string, unknown> | null;
      if (profile && typeof profile === "object") {
        const consumption = {
          ...((profile.consumption_tax as Record<string, unknown>) ?? {}),
          status: setup.consumption.status,
          invoice_registered: setup.consumption.invoice_registered,
          ...(setup.consumption.method ? { method: setup.consumption.method } : {}),
          ...(setup.consumption.invoice_registration_number
            ? { invoice_registration_number: setup.consumption.invoice_registration_number }
            : {}),
          ...(setup.consumption.notes ? { notes: setup.consumption.notes } : {}),
        };
        const taxPath = join(financeDir, "tax-profile.yaml");
        writeYamlFile(taxPath, { ...profile, consumption_tax: consumption });
        touched.push(taxPath);
      }
    } catch {
      /* tax-profile optional during early setup */
    }
  }

  return touched;
}

export function parseSetupFromFile(path: string): BlueReturnSetup {
  return readYamlFile(path, blueReturnSetupSchema);
}

export function parseExpenseIntakeFromFile(path: string): BlueReturnExpenseIntake {
  return readYamlFile(path, blueReturnExpenseIntakeSchema);
}

export function upsertExpenseIntake(intake: BlueReturnExpenseIntake): string {
  const file = loadBlueReturnExpenseIntakes();
  const parsed = blueReturnExpenseIntakeSchema.parse(intake);
  const idx = file.intakes.findIndex((i) => i.intake_id === parsed.intake_id);
  if (idx >= 0) file.intakes[idx] = parsed;
  else file.intakes.push(parsed);
  if (parsed.occurred_on) {
    file.calendar_year = Number.parseInt(parsed.occurred_on.slice(0, 4), 10);
  }
  return saveBlueReturnExpenseIntakes(file);
}

/** Record 65万 gate evidence timestamps on blue-return-filing.yaml. */
export function applyFilingEvidence(input: {
  calendarYear: number;
  etaxSubmittedAt?: string;
  denshiYuryoNotifiedAt?: string;
  notes?: string;
}): string {
  const path = join(getDataDir(), "finance", "blue-return-filing.yaml");
  const raw = existsSync(path)
    ? (YAML.parse(readFileSync(path, "utf-8")) as Record<string, unknown>)
    : { version: 1 };
  raw.calendar_year = input.calendarYear;
  if (input.etaxSubmittedAt) raw.etax_submitted_at = input.etaxSubmittedAt;
  if (input.denshiYuryoNotifiedAt) {
    raw.denshi_yuryo_notified_at = input.denshiYuryoNotifiedAt;
  }
  if (input.notes) {
    raw.notes = [typeof raw.notes === "string" ? raw.notes : "", input.notes]
      .filter(Boolean)
      .join("\n");
  }
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(path, raw);
  return path;
}
