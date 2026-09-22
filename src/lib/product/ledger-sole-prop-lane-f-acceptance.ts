/**
 * Lane F acceptance. 100 = owner capital, general-use blue-return lines, and income tax.
 * Corporate annex modules are not a source.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { evaluateAnnualCloseGates, postAnnualPlTransfer } from "../finance/annual-close.js";
import { appendJournalEntry, loadJournalEntries } from "../finance/expense-claim-journal.js";
import { assessBlueReturnDeduction, buildSolePropBlueReturn } from "../finance/sole-prop-blue-return.js";
import { buildSolePropIncomeTaxReturnDraft } from "../finance/sole-prop-income-tax-return.js";
import {
  scoreBlueReturnLines,
  scoreIncomeTaxReturn,
  scoreMonthlyClose,
  scoreOwnerCapital,
  type BasicDeductionBand,
  type BlueReturnLinePin,
  type IncomeTaxYenPin,
} from "../finance/sole-prop-core-score.js";
import {
  computeSolePropLocalTax,
  projectOfficialSolePropLocalTaxLines,
  resolvePerCapita,
  scoreSolePropLocalTax,
  type SolePropLocalRates,
  type SolePropLocalTaxLine,
} from "../finance/sole-prop-local-tax.js";
import {
  evaluateSolePropMonthlyClose,
  monthRevenueExcludingOwnerCapital,
} from "../finance/sole-prop-monthly-close.js";
import { buildTrialBalance } from "../finance/ledger/trial-balance.js";
import { loadChartOfAccounts } from "../data.js";
import { getDataDir } from "../utils.js";
import { clearTenantId, getTenantId, setTenantId } from "../tenant.js";
import { getTenantsDir, refreshOrgOsPaths } from "../orgos-paths.js";
import { provisionLedgerTenant } from "./ledger-provision.js";
import { ensureLedgerDemoChartOfAccounts } from "./ledger-coa-ensure.js";

export type SolePropLaneFCheck = {
  id: string;
  weight: number;
  pass: boolean;
  detail: string;
};

export type SolePropLaneFAcceptanceResult = {
  isolated: true;
  score: number;
  max_score: number;
  checks: SolePropLaneFCheck[];
};

const FY = "FY2026";
const FORBIDDEN_SOURCE = ["tax-adjustment", "jp-corporate-tax-xml", "evaluateTaxAdjustment"];
const SOURCE_FILES = [
  "src/lib/finance/sole-prop-blue-return.ts",
  "src/lib/finance/sole-prop-income-adjustment.ts",
  "src/lib/finance/sole-prop-income-tax-return.ts",
  "src/lib/finance/income-tax-policy.ts",
  "src/lib/finance/sole-prop-monthly-close.ts",
  "src/lib/finance/sole-prop-local-tax.ts",
  "src/lib/finance/sole-prop-core-score.ts",
];

export type SolePropAcceptancePins = {
  blue: BlueReturnLinePin;
  incomeLineIds: string[];
  basicDeductionBands: BasicDeductionBand[];
  /** Official No.1199 (etc.) printed yen. Empty pin cannot score income tax. */
  incomeTaxOfficialYen: IncomeTaxYenPin[];
  localRates: SolePropLocalRates;
  /** Official calculation-example / form rows + printed yen. Empty pin → local-tax 0. */
  localOfficialLines: SolePropLocalTaxLine[];
};

function check(id: string, weight: number, pass: boolean, detail: string): SolePropLaneFCheck {
  return { id, weight, pass, detail };
}

function codeNamed(name: string): string {
  const account = loadChartOfAccounts().accounts.find((row) => row.name === name);
  if (!account) throw new Error(`missing account ${name}`);
  return account.code;
}

function postBalanced(input: {
  entryId: string;
  debit: string;
  credit: string;
  amount: number;
}): void {
  appendJournalEntry({
    entry_id: input.entryId,
    occurred_at: "2026-06-15T00:00:00.000Z",
    description: input.entryId,
    source: { kind: "manual", authorized_by: "OP-LANE-F" },
    evidence_refs: [`test:${input.entryId}`],
    lines: [
      {
        account_code: input.debit,
        debit_yen: input.amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: input.credit,
        debit_yen: 0,
        credit_yen: input.amount,
        tax_category: "out_of_scope",
      },
    ],
  });
}

function writeReturnYaml(): void {
  writeFileSync(
    join(getDataDir(), "finance", "income-tax-return.yaml"),
    `fiscal_year: ${FY}\nestimated_tax_yen: 999\nother_income:\n  status: none\ndeductions:\n  status: none\ncredits:\n  status: none\nwithholding:\n  status: none\nprepayment:\n  status: none\n`,
    "utf-8",
  );
}

export function runIsolatedSolePropLaneFAcceptance(
  pins: SolePropAcceptancePins,
): SolePropLaneFAcceptanceResult {
  const originalWorkspace = process.env.ORGOS_WORKSPACE;
  const originalSkip = process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
  const originalLog = console.log;
  const originalTenant = (() => {
    try {
      return getTenantId();
    } catch {
      return null;
    }
  })();
  const workspace = mkdtempSync(join(tmpdir(), "orgos-lane-f-"));
  const checks: SolePropLaneFCheck[] = [];

  try {
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    console.log = () => undefined;
    refreshOrgOsPaths();

    provisionLedgerTenant({
      tenantId: "sole-prop-lane-f",
      companyName: "Lane F",
      adminEmail: "owner@sole-prop-lane-f.example",
      plan: "business",
      entityForm: "sole_proprietorship",
    });
    setTenantId("sole-prop-lane-f");
    ensureLedgerDemoChartOfAccounts();

    const tenantRaw = readFileSync(
      join(getTenantsDir(), "sole-prop-lane-f", "tenant.yaml"),
      "utf-8",
    );
    const form = tenantRaw.match(/^entity_form:\s*(\S+)/m)?.[1] ?? "";
    const profile = YAML.parse(
      readFileSync(join(getDataDir(), "finance", "tax-profile.yaml"), "utf-8"),
    ) as { entity?: { type?: string }; fiscal_year?: { end_month?: number }; corporate_tax?: unknown };
    checks.push(
      check(
        "provision-calendar",
        8,
        form === "sole_proprietorship" &&
          profile.fiscal_year?.end_month === 12 &&
          profile.entity?.type === "個人事業主" &&
          profile.corporate_tax == null,
        `form=${form} end=${profile.fiscal_year?.end_month} type=${profile.entity?.type}`,
      ),
    );

    const coa = loadChartOfAccounts();
    const byName = (name: string) => coa.accounts.find((row) => row.name === name);
    const capital = byName("元入金");
    const drawings = byName("事業主貸");
    const advances = byName("事業主借");
    const retained = coa.accounts.find(
      (row) => row.code === coa.journal_source_accounts?.retained_earnings,
    );
    checks.push(
      check(
        "owner-accounts",
        10,
        capital?.type === "equity" &&
          drawings?.type === "asset" &&
          advances?.type === "liability" &&
          coa.journal_source_accounts?.owner_capital === capital?.code &&
          coa.journal_source_accounts?.owner_drawings === drawings?.code &&
          coa.journal_source_accounts?.owner_advances === advances?.code &&
          retained?.name !== "元入金",
        `capital=${capital?.type} drawings=${drawings?.type} advances=${advances?.type} retained=${retained?.name}`,
      ),
    );

    postBalanced({
      entryId: "JE-F-SALE",
      debit: "1100",
      credit: codeNamed("売上高"),
      amount: 10_000,
    });
    postBalanced({
      entryId: "JE-F-TAX",
      debit: codeNamed("租税公課"),
      credit: "1100",
      amount: 4_000,
    });
    postBalanced({
      entryId: "JE-F-DRAW",
      debit: codeNamed("事業主貸"),
      credit: "1100",
      amount: 500,
    });
    postBalanced({
      entryId: "JE-F-ADV",
      debit: "1100",
      credit: codeNamed("事業主借"),
      amount: 800,
    });
    const transferId = postAnnualPlTransfer({ fiscalYear: FY, asOf: "2026-12-31" });
    const transfer = loadJournalEntries().entries.find((row) => row.entry_id === transferId);
    const transferLine = transfer?.lines.find((line) => line.credit_yen === 6_000);
    const transferName = transferLine
      ? coa.accounts.find((row) => row.code === transferLine.account_code)?.name
      : "";
    const tb = buildTrialBalance({ asOf: "2026-12-31" });
    const tbRow = (name: string) => tb.rows.find((row) => row.account_name === name);
    checks.push(
      check(
        "tb-named-capital",
        12,
        tbRow("事業主貸")?.balance_yen === 500 &&
          tbRow("事業主借")?.balance_yen === 800 &&
          (tbRow("元入金")?.balance_yen ?? 0) === 0 &&
          !tb.rows.some((row) => row.account_name === "資本金"),
        tb.rows.map((row) => `${row.account_name}:${row.balance_yen}`).join(","),
      ),
    );
    const gates = evaluateAnnualCloseGates(FY);
    const capitalScore = scoreOwnerCapital({
      openingYen: 0,
      closingYen: tbRow("元入金")?.balance_yen ?? 0,
      incomeYen: 6_000,
      capitalTransferYen: transferName === "元入金" ? 6_000 : 0,
      incomeIsSeparateLine: transferName !== "元入金" && transferName.length > 0,
    });
    checks.push(
      check(
        "owner-capital-equal",
        18,
        capitalScore === 18 &&
          !gates.errors.some((issue) => issue.includes("tax-adjustment")),
        `transfer=${transferName} score=${capitalScore}`,
      ),
    );

    provisionLedgerTenant({
      tenantId: "kk-lane-f",
      companyName: "KK Lane F",
      adminEmail: "ceo@kk-lane-f.example",
      plan: "business",
      entityForm: "kk",
    });
    setTenantId("kk-lane-f");
    const kkCoa = ensureLedgerDemoChartOfAccounts();
    postBalanced({
      entryId: "JE-F-KK",
      debit: "1100",
      credit: "4100",
      amount: 3_000,
    });
    const kkTransferId = postAnnualPlTransfer({ fiscalYear: FY, asOf: "2026-12-31" });
    const kkEntry = loadJournalEntries().entries.find((row) => row.entry_id === kkTransferId);
    const kkLine = kkEntry?.lines.find((line) => line.credit_yen === 3_000);
    const kkName = kkLine
      ? kkCoa.accounts.find((row) => row.code === kkLine.account_code)?.name
      : "";
    const kkPass = kkName === "繰越利益剰余金";
    setTenantId("sole-prop-lane-f");
    const motokane = checks.find((row) => row.id === "owner-capital-equal");
    if (motokane) {
      motokane.pass = motokane.pass && kkPass;
      motokane.detail = `${motokane.detail} kk=${kkName}`;
    }

    const missing = buildSolePropBlueReturn(FY);
    writeFileSync(join(getDataDir(), "finance", "sole-prop-return.yaml"), "return_method: white\n");
    const white = buildSolePropBlueReturn(FY);
    checks.push(
      check(
        "blue-choice",
        6,
        missing.status === "blocked" &&
          white.status === "blocked" &&
          missing.corporate_tax_is_primary === false &&
          white.corporate_tax_is_primary === false &&
          !missing.headline.includes("法人税見込") &&
          !white.headline.includes("法人税見込"),
        `${missing.blockers.join(";")} / ${white.blockers.join(";")}`,
      ),
    );

    writeFileSync(join(getDataDir(), "finance", "sole-prop-return.yaml"), "return_method: blue\n");
    writeFileSync(join(getDataDir(), "finance", "blue-return-inventory.yaml"), "status: none\n");
    const draft = buildSolePropBlueReturn(FY);
    const draftJson = JSON.stringify(draft);
    const sourceClean = SOURCE_FILES.every((rel) => {
      const text = readFileSync(rel, "utf-8");
      return FORBIDDEN_SOURCE.every((token) => !text.includes(token));
    });
    const line = (id: string) => draft.lines.find((row) => row.id === id);
    const blueScore = scoreBlueReturnLines(
      draft.lines.map((row) => ({ print: row.print, role: row.role })),
      pins.blue,
    );
    checks.push(
      check(
        "blue-return-lines",
        22,
        sourceClean &&
          blueScore === 22 &&
          line("sales_1")?.print === "①" &&
          line("expense_8")?.label === "租税公課" &&
          line("expense_30")?.label === "雑費" &&
          line("expense_31")?.print === "㉛" &&
          line("expense_31")?.label === "経費計" &&
          line("inventory_open_2")?.role === "opening_inventory" &&
          Boolean(line("income_after_blue")) &&
          line("bs_drawings")?.label === "事業主貸" &&
          line("bs_advances")?.label === "事業主借" &&
          line("bs_capital")?.label === "元入金" &&
          !draftJson.includes("betsu-4") &&
          !draftJson.includes("別表四") &&
          !draftJson.includes("AnnexDraft") &&
          !draftJson.includes("evaluateTaxAdjustment") &&
          !("sales" in draft && "expenses" in draft && "income" in draft),
        draft.blockers.join(";") || `${draft.headline} score=${blueScore}`,
      ),
    );

    writeFileSync(
      join(getDataDir(), "finance", "blue-return-inventory.yaml"),
      "status: counted\nbeginning_yen: 100\nending_yen: 40\n",
    );
    const counted = buildSolePropBlueReturn(FY);
    unlinkSync(join(getDataDir(), "finance", "blue-return-inventory.yaml"));
    const undeclared = buildSolePropBlueReturn(FY);
    writeFileSync(join(getDataDir(), "finance", "blue-return-inventory.yaml"), "status: none\n");
    const restored = buildSolePropBlueReturn(FY);
    checks.push(
      check(
        "blue-pl-bs",
        10,
        restored.status === "ready" &&
          restored.income_before_blue_deduction_yen === 6_000 &&
          restored.bs_income_before_blue_deduction_yen === 6_000 &&
          restored.capital_opening_yen === restored.capital_closing_yen &&
          restored.capital_transfer_yen === 0 &&
          restored.lines.find((row) => row.id === "bs_capital")?.amount_yen === 0 &&
          restored.lines.find((row) => row.id === "inventory_open_2")?.amount_yen === 0 &&
          counted.lines.find((row) => row.id === "inventory_open_2")?.amount_yen === 100 &&
          counted.lines.find((row) => row.id === "inventory_open_2")?.amount_yen !== counted.cogs_yen &&
          counted.lines.find((row) => row.id === "bs_capital")?.amount_yen === 0 &&
          restored.cogs_yen == null &&
          counted.cogs_yen === 60 &&
          counted.income_before_blue_deduction_yen === 5_940 &&
          counted.bs_income_before_blue_deduction_yen === 5_940 &&
          typeof undeclared.cogs_yen !== "number",
        `restored=${restored.income_before_blue_deduction_yen}/${restored.bs_income_before_blue_deduction_yen} counted=${counted.cogs_yen} undeclared=${undeclared.cogs_yen}`,
      ),
    );

    postBalanced({
      entryId: "JE-F-MORE",
      debit: "1100",
      credit: codeNamed("売上高"),
      amount: 4_994_500,
    });
    const scaled = buildSolePropBlueReturn(FY);
    const capHigh = assessBlueReturnDeduction({
      businessIncomeYen: 5_000_500,
      doubleEntry: true,
      hasBalanceSheet: true,
      hasProfitAndLoss: true,
    });
    const capElectronic = assessBlueReturnDeduction({
      businessIncomeYen: 5_000_500,
      doubleEntry: true,
      hasBalanceSheet: true,
      hasProfitAndLoss: true,
      etaxSubmittedAt: "2027-03-15",
    });
    const capZero = assessBlueReturnDeduction({
      businessIncomeYen: 0,
      doubleEntry: true,
      hasBalanceSheet: true,
      hasProfitAndLoss: true,
    });
    const capSmall = assessBlueReturnDeduction({
      businessIncomeYen: 100_000,
      doubleEntry: true,
      hasBalanceSheet: true,
      hasProfitAndLoss: true,
    });
    const capDefault = assessBlueReturnDeduction({ businessIncomeYen: 5_000_500 });
    checks.push(
      check(
        "blue-deduction-cap",
        8,
        capHigh.applied_yen === 550_000 &&
          capElectronic.applied_yen === 650_000 &&
          capZero.applied_yen === 0 &&
          capSmall.applied_yen === 100_000 &&
          capSmall.applied_yen <= 100_000 &&
          capDefault.applied_yen === 0 &&
          scaled.deduction_gate.applied_yen === 550_000 &&
          scaled.deduction_gate.applied_yen !== 650_000 &&
          scaled.lines.find((row) => row.id === "blue_deduction")?.amount_yen === 550_000 &&
          scaled.income_yen === 4_450_500,
        `high=${capHigh.applied_yen} electronic=${capElectronic.applied_yen} draft=${scaled.deduction_gate.applied_yen}`,
      ),
    );

    writeReturnYaml();
    const blueForTax = buildSolePropBlueReturn(FY);
    const tax = buildSolePropIncomeTaxReturnDraft(FY);
    checks.push(
      check(
        "income-from-blue",
        8,
        tax.ready &&
          tax.business_income_yen === blueForTax.income_yen &&
          tax.business_income_yen === 4_450_500 &&
          tax.income_tax_yen !== 999 &&
          tax.estimated_tax_yen === 999 &&
          tax.taxpayer_kind === "sole_proprietorship",
        `business=${tax.business_income_yen} blue=${blueForTax.income_yen} tax=${tax.income_tax_yen}`,
      ),
    );
    writeFileSync(
      join(getDataDir(), "finance", "blue-return-filing.yaml"),
      "etax_submitted_at: 2027-03-15\n",
    );
    const withEvidence = buildSolePropIncomeTaxReturnDraft(FY);
    const evidencedBlue = buildSolePropBlueReturn(FY);
    checks.push(
      check(
        "progressive-floors",
        10,
          tax.taxable_before_thousand_floor_yen === 3_770_500 &&
          tax.taxable_yen === 3_770_000 &&
          tax.income_tax_before_floor_yen === 326_500 &&
          tax.income_tax_yen === 326_500 &&
          tax.reconstruction_yen === 6_856 &&
          tax.remaining_yen === 333_356 &&
          tax.payable_yen === 333_300 &&
          tax.basic_deduction_yen === 680_000 &&
          evidencedBlue.lines.find((row) => row.id === "blue_deduction")?.amount_yen === 650_000 &&
          evidencedBlue.income_yen === 4_350_500 &&
          withEvidence.taxable_yen === 3_670_000 &&
          withEvidence.income_tax_yen === 306_500,
        `base=${tax.taxable_yen}/${tax.income_tax_yen}/${tax.reconstruction_yen}/${tax.payable_yen} evidence=${withEvidence.taxable_yen}/${withEvidence.income_tax_yen}`,
      ),
    );

    const journalsBefore = loadJournalEntries().entries.length;
    unlinkSync(join(getDataDir(), "finance", "income-tax-return.yaml"));
    const closed = buildSolePropIncomeTaxReturnDraft(FY);
    const closedJson = JSON.stringify(closed);
    checks.push(
      check(
        "fail-closed-no-side-effects",
        6,
        closed.ready === false &&
          closed.income_tax_yen == null &&
          loadJournalEntries().entries.length === journalsBefore &&
          closed.submission === "not-for-etax" &&
          !closedJson.includes("RHO0010"),
        closed.blockers.join(";"),
      ),
    );

    const incomeScore = scoreIncomeTaxReturn({
      lines: tax.lines,
      requiredLineIds: pins.incomeLineIds,
      pinnedYen: pins.incomeTaxOfficialYen,
    });
    checks.push(
      check(
        "income-tax-return",
        20,
        incomeScore === 20 && tax.lines.some((row) => row.id === "basic_deduction"),
        `score=${incomeScore} basic=${tax.basic_deduction_yen}`,
      ),
    );

    const capitalMissing = resolvePerCapita({
      basis: "capital_and_headcount",
      flatYen:
        pins.localRates.inhabitant.per_capita.prefecture_yen +
        pins.localRates.inhabitant.per_capita.municipality_yen,
      capitalYen: null,
      headcount: null,
    });
    const mechanism = computeSolePropLocalTax({
      inhabitantTaxableYen: 1_000_000,
      enterpriseIncomeYen: 4_000_000,
      enterpriseKind: "type1",
      capitalYen: null,
      headcount: null,
      rates: pins.localRates,
    });
    const projected = projectOfficialSolePropLocalTaxLines();
    const localScore = scoreSolePropLocalTax(projected, pins.localOfficialLines, {
      missingCapitalHeadcountCompletedAsZero:
        capitalMissing.complete && capitalMissing.yen === 0,
    });
    checks.push(
      check(
        "local-tax",
        12,
        localScore === 12 &&
          !mechanism.missing_capital_headcount_completed_as_zero &&
          capitalMissing.yen === null,
        `score=${localScore} lines=${projected.length} pin=${pins.localOfficialLines.length}`,
      ),
    );

    writeFileSync(join(getDataDir(), "finance", "cash-balance.yaml"), "currency: JPY\n");
    const monthGate = evaluateSolePropMonthlyClose("2026-01");
    const monthRevenue = monthRevenueExcludingOwnerCapital({
      lines: [
        { account_code: "4100", credit_yen: 10_000, debit_yen: 0 },
        { account_code: codeNamed("元入金"), credit_yen: 6_000, debit_yen: 0 },
      ],
      accounts: loadChartOfAccounts().accounts.map((row) => ({
        code: row.code,
        name: row.name,
        type: row.type,
      })),
      ownerCapitalCode: codeNamed("元入金"),
    });
    const monthScore = scoreMonthlyClose({
      canLock: monthGate.can_lock,
      bankGateFailed: monthGate.bank_gate_failed,
      ownerCapitalInRevenue: monthRevenue.owner_capital_in_revenue,
    });
    checks.push(
      check(
        "monthly-close",
        12,
        monthScore === 12 && monthRevenue.revenue_yen === 10_000,
        `score=${monthScore} bank=${monthGate.bank_gate_failed} lock=${monthGate.can_lock} revenue=${monthRevenue.revenue_yen} errors=${monthGate.errors.join(";")}`,
      ),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push(check("runner-exception", 100, false, detail));
  } finally {
    console.log = originalLog;
    if (originalWorkspace === undefined) delete process.env.ORGOS_WORKSPACE;
    else process.env.ORGOS_WORKSPACE = originalWorkspace;
    if (originalSkip === undefined) delete process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
    else process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = originalSkip;
    refreshOrgOsPaths();
    if (originalTenant && existsSync(join(getTenantsDir(), originalTenant, "tenant.yaml"))) {
      setTenantId(originalTenant);
    } else clearTenantId();
    rmSync(workspace, { recursive: true, force: true });
  }

  const score = checks.reduce((sum, row) => sum + (row.pass ? row.weight : 0), 0);
  const maxScore = checks.reduce((sum, row) => sum + row.weight, 0);
  return { isolated: true, score, max_score: maxScore === 100 ? 100 : maxScore, checks };
}
