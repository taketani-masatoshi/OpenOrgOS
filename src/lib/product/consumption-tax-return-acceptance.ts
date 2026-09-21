/**
 * Lane C acceptance. Score is 100 only when every weighted check passes.
 * A single failure scores 0. The row-id regression tests are not this score.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ConsumptionTaxReturnMap } from "../../../schemas/finance/consumption-tax-return-map.js";
import { appendJournalEntry } from "../finance/expense-claim-journal.js";
import {
  buildFiscalYearConsumptionTaxReturnRows,
  loadConsumptionTaxReturnMap,
  projectConsumptionTaxReturnRows,
  type ConsumptionTaxPurchaseContext,
  type ConsumptionTaxReturnBases,
  type ConsumptionTaxReturnRows,
} from "../finance/consumption-tax-return-rows.js";
import { resolveJournalSourceAccounts } from "../finance/journal-source-accounts.js";
import { refreshOrgOsPaths } from "../orgos-paths.js";
import { clearTenantId, getTenantId, setTenantId } from "../tenant.js";
import { readYamlFile } from "../utils.js";
import { ensureLedgerDemoChartOfAccounts } from "./ledger-coa-ensure.js";
import { provisionLedgerTenant } from "./ledger-provision.js";

const FORM_SHEETS = new Set(["return_page1", "return_page2", "schedule_1_3", "schedule_2_3"]);

const coordinateSchema = z
  .object({
    source_label: z.string().min(1),
    rows: z
      .array(
        z
          .object({
            sheet: z.string().min(1),
            line: z.string().min(1),
            label_ja: z.string().min(1),
            required: z.boolean(),
            status: z.enum(["verified", "unverified"]),
            citation: z.string(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const goldenSchema = z
  .object({
    cases: z
      .array(
        z
          .object({
            id: z.string().min(1),
            citation: z.string(),
            bases: z
              .object({
                taxable_sales_10_yen: z.number().int().nonnegative(),
                taxable_sales_8_yen: z.number().int().nonnegative(),
              })
              .strict(),
            purchases: z
              .object({
                taxable_sales_yen: z.number().int().nonnegative(),
                ratio: z
                  .object({
                    taxable_yen: z.number().int().nonnegative(),
                    total_yen: z.number().int().positive(),
                  })
                  .strict(),
                lines: z.array(
                  z
                    .object({
                      occurred_on: z.string(),
                      tax_category: z.enum(["taxable_10", "taxable_8"]),
                      base_yen: z.number().int().nonnegative(),
                      invoice_status: z.enum([
                        "qualified",
                        "nonqualified_80",
                        "nonqualified_70",
                        "nonqualified_50",
                      ]),
                      purchase_use: z.literal("taxable_only"),
                    })
                    .strict()
                ),
              })
              .strict(),
            expect: z
              .array(
                z
                  .object({
                    sheet: z.string().min(1),
                    line: z.string().min(1),
                    amount_yen: z.number().int(),
                  })
                  .strict()
              )
              .min(1),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

type Coordinates = z.infer<typeof coordinateSchema>;
type Golden = z.infer<typeof goldenSchema>;

export type ConsumptionTaxReturnCheck = {
  id: string;
  weight: number;
  pass: boolean;
  detail: string;
};

export type ConsumptionTaxReturnAcceptance = {
  score: number;
  checks: ConsumptionTaxReturnCheck[];
};

export function runConsumptionTaxReturnRowAcceptance(): ConsumptionTaxReturnAcceptance {
  const mapping = loadConsumptionTaxReturnMap();
  const coordinates = readYamlFile(fixturePath("official-coordinates.yaml"), coordinateSchema);
  const golden = readYamlFile(fixturePath("golden.yaml"), goldenSchema);
  const checks: ConsumptionTaxReturnCheck[] = [
    check("official-coordinates", 20, officialCoordinates(coordinates, mapping)),
    check("per-rate-floor", 10, perRateFloor(mapping)),
    check("national-rates", 10, nationalRates(mapping)),
    check("schedule-transfer", 15, scheduleTransfer(mapping)),
    check("purchase-credit", 15, purchaseCredit(mapping)),
    check("payable-hundred-floor", 10, payableHundredFloor(mapping)),
    check("local-tax", 10, localTax(mapping)),
    check("journal-chain", 5, journalChain(golden)),
    check("external-golden", 5, externalGolden(mapping, golden)),
  ];
  const score = checks.every((row) => row.pass) ? 100 : 0;
  return { score, checks };
}

function officialCoordinates(
  coordinates: Coordinates,
  mapping: ConsumptionTaxReturnMap
): { pass: boolean; detail: string } {
  const matched = matchOfficialCoordinates(coordinates, mapping);
  if (!matched.pass) return matched;
  const blanked = matchOfficialCoordinates(
    {
      ...coordinates,
      rows: coordinates.rows.map((row) => (row.required ? { ...row, citation: "" } : row)),
    },
    mapping
  );
  if (blanked.pass) return fail("empty citation was accepted");
  return matched;
}

function matchOfficialCoordinates(
  coordinates: Coordinates,
  mapping: ConsumptionTaxReturnMap
): { pass: boolean; detail: string } {
  const listed = new Map(coordinates.rows.map((row) => [key(row.sheet, row.line), row]));
  const emitted = mapping.rows.filter((row) => FORM_SHEETS.has(row.sheet));
  for (const row of emitted) {
    if (row.line.includes("差引前")) return fail(`emitted ${row.line}`);
    const coordinate = listed.get(key(row.sheet, row.line));
    if (!coordinate) return fail(`emitted ${row.sheet} ${row.line} is not on the official list`);
    if (coordinate.status !== "verified") return fail(`${row.sheet} ${row.line} is not verified`);
  }
  for (const coordinate of coordinates.rows) {
    if (!coordinate.required) continue;
    if (coordinate.status !== "verified" || !citationAccepted(coordinate.citation)) {
      return fail(`${coordinate.sheet} ${coordinate.line} has no citation`);
    }
    const found = emitted.filter(
      (row) => row.sheet === coordinate.sheet && row.line === coordinate.line
    );
    if (found.length !== 1)
      return fail(`${coordinate.sheet} ${coordinate.line} is not mapped once`);
  }
  return { pass: true, detail: "official lines match the cited list" };
}

function perRateFloor(mapping: ConsumptionTaxReturnMap): { pass: boolean; detail: string } {
  const split = project(mapping, {
    taxable_sales_10_yen: 1_500,
    taxable_sales_8_yen: 1_500,
  });
  const page1 = amount(split, "return_page1", "①");
  const rate6 = amount(split, "return_page2", "⑤");
  const rate7 = amount(split, "return_page2", "⑥");
  const inclusive = project(mapping, { taxable_sales_10_yen: 1_650, taxable_sales_8_yen: 0 });
  const pass =
    rate6 === 1_000 &&
    rate7 === 1_000 &&
    page1 === 2_000 &&
    page1 !== 3_000 &&
    amount(inclusive, "return_page2", "⑥") === 1_000 &&
    amount(inclusive, "schedule_1_3", "②B") === 78 &&
    amount(inclusive, "schedule_1_3", "②B") !== 117;
  return {
    pass,
    detail: pass
      ? "each rate is floored before the sum"
      : `page1=${page1} rate6=${rate6} rate7=${rate7}`,
  };
}

function nationalRates(mapping: ConsumptionTaxReturnMap): { pass: boolean; detail: string } {
  const rows = project(mapping, { taxable_sales_10_yen: 1_000, taxable_sales_8_yen: 1_000 });
  const ten = amount(rows, "schedule_1_3", "②B");
  const eight = amount(rows, "schedule_1_3", "②A");
  const pass = ten === 78 && ten !== 100 && ten !== 80 && eight === 62;
  return { pass, detail: pass ? "1000 yen floors to 78 and 62" : `10%=${ten} 8%=${eight}` };
}

function scheduleTransfer(mapping: ConsumptionTaxReturnMap): { pass: boolean; detail: string } {
  const rows = projectCase(mapping, "mixed-rates");
  const credit = amount(rows, "schedule_2_3", "㉖");
  const tied =
    credit !== null &&
    credit === amount(rows, "schedule_1_3", "④") &&
    credit === amount(rows, "return_page1", "④") &&
    amount(rows, "return_page2", "⑤")! + amount(rows, "return_page2", "⑥")! ===
      amount(rows, "return_page1", "①");
  const shiftedMap: ConsumptionTaxReturnMap = {
    ...mapping,
    rows: mapping.rows.map((row) =>
      row.sheet === "return_page1" && row.line === "④"
        ? {
            ...row,
            source: {
              kind: "row" as const,
              id: mapping.rows.find(
                (candidate) => candidate.sheet === "return_page1" && candidate.line === "②"
              )!.id,
            },
          }
        : row
    ),
  };
  const shifted = projectCase(shiftedMap, "mixed-rates");
  const shiftDetected =
    amount(shifted, "return_page1", "④") !== amount(shifted, "schedule_2_3", "㉖");
  const pass = tied && shiftDetected;
  return {
    pass,
    detail: pass ? "schedule lines transfer once" : "transfer tie or shift probe failed",
  };
}

function purchaseCredit(mapping: ConsumptionTaxReturnMap): { pass: boolean; detail: string } {
  const fullRatio = { taxable_yen: 10000, total_yen: 10000 };
  const full = creditAmount(mapping, qualifiedLine("2026-04-01", "qualified"), fullRatio);
  const lowRatio = creditAmount(mapping, qualifiedLine("2026-04-01", "qualified"), {
    taxable_yen: 9499,
    total_yen: 10000,
  });
  const overCap = creditAmount(
    mapping,
    qualifiedLine("2026-04-01", "qualified"),
    fullRatio,
    500_000_001
  );
  const missingStatus = project(mapping, salesOf(1_000), {
    lines: [
      {
        occurred_on: "2026-04-01",
        tax_category: "taxable_10",
        base_yen: 1_000,
        purchase_use: "taxable_only",
      },
    ],
    ratio: fullRatio,
    taxable_sales_yen: 1_000,
  });
  const missingRatio = creditAmount(mapping, qualifiedLine("2026-04-01", "qualified"));
  const at80 = creditAmount(mapping, qualifiedLine("2026-09-30", "nonqualified_80"), fullRatio);
  const disagree70 = creditAmount(
    mapping,
    qualifiedLine("2026-10-01", "nonqualified_80"),
    fullRatio
  );
  const at70 = creditAmount(mapping, qualifiedLine("2026-10-01", "nonqualified_70"), fullRatio);
  const at50 = creditAmount(mapping, qualifiedLine("2028-10-01", "nonqualified_50"), fullRatio);
  const disagree50 = creditAmount(
    mapping,
    qualifiedLine("2028-10-01", "nonqualified_80"),
    fullRatio
  );
  const common = project(mapping, salesOf(1_000), {
    lines: [
      {
        occurred_on: "2026-04-01",
        tax_category: "taxable_10",
        base_yen: 1_000,
        invoice_status: "qualified",
        purchase_use: "common",
      },
    ],
    ratio: { taxable_yen: 10000, total_yen: 10000 },
    taxable_sales_yen: 1_000,
  });
  const missingRow = missingStatus.rows.find(
    (row) => row.sheet === "schedule_2_3" && row.line === "㉖"
  );
  const pass =
    full === 78 &&
    lowRatio === null &&
    overCap === null &&
    missingRatio === null &&
    missingRow?.row_status === "blocked" &&
    missingRow.amount_yen === null &&
    at80 === 62 &&
    disagree70 === null &&
    at70 === 54 &&
    at50 === 39 &&
    disagree50 === null &&
    amount(common, "schedule_2_3", "㉖") === null;
  return {
    pass,
    detail: pass
      ? "full credit only when qualified, within the cap, and on the date table"
      : `full=${full} 80=${at80} 70=${at70} 50=${at50}`,
  };
}

function payableHundredFloor(mapping: ConsumptionTaxReturnMap): { pass: boolean; detail: string } {
  const payable = projectCase(mapping, "mixed-rates");
  const refund = project(
    mapping,
    { taxable_sales_10_yen: 1_000, taxable_sales_8_yen: 0 },
    {
      lines: [qualifiedLine("2026-04-01", "qualified", 10_000)],
      ratio: { taxable_yen: 10000, total_yen: 10000 },
    }
  );
  const net = amount(payable, "return_page1", "⑨");
  const refundNet = amount(refund, "return_page1", "⑨");
  const pass = net === 133_000 && refundNet === -702;
  return {
    pass,
    detail: pass
      ? "payable nets floor to 100 yen; refunds do not"
      : `net=${net} refund=${refundNet}`,
  };
}

function localTax(mapping: ConsumptionTaxReturnMap): { pass: boolean; detail: string } {
  const payable = projectCase(mapping, "mixed-rates");
  const refund = project(
    mapping,
    { taxable_sales_10_yen: 1_000, taxable_sales_8_yen: 0 },
    {
      lines: [qualifiedLine("2026-04-01", "qualified", 10_000)],
      ratio: { taxable_yen: 10000, total_yen: 10000 },
    }
  );
  const pass =
    amount(payable, "return_page1", "⑱") === amount(payable, "return_page1", "⑨") &&
    amount(payable, "return_page1", "⑳") === 37_500 &&
    amount(refund, "return_page1", "⑳") === -198;
  return {
    pass,
    detail: pass ? "local tax follows 22/78 and floors only a payment" : "local tax mismatch",
  };
}

function journalChain(golden: Golden): { pass: boolean; detail: string } {
  const expected = golden.cases.find((row) => row.id === "journal-chain");
  if (!expected || !citationAccepted(expected.citation))
    return fail("journal golden citation is empty");
  const originalWorkspace = process.env.ORGOS_WORKSPACE;
  const originalSkip = process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
  const originalTenant = currentTenant();
  const workspace = mkdtempSync(join(tmpdir(), "orgos-consumption-return-"));
  try {
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    refreshOrgOsPaths();
    const tenantId = "consumption-return-acceptance";
    provisionLedgerTenant({
      tenantId,
      companyName: "Consumption Return Acceptance KK",
      adminEmail: "ceo@consumption-return-acceptance.example",
      plan: "business",
    });
    setTenantId(tenantId);
    ensureLedgerDemoChartOfAccounts();
    const bank = resolveJournalSourceAccounts().bank_control;
    appendJournalEntry({
      entry_id: "JE-CT-SALES",
      occurred_at: "2026-06-15T00:00:00.000Z",
      description: "taxable sales",
      source: { kind: "manual", authorized_by: "OP-CT" },
      evidence_refs: ["test:sales"],
      lines: [
        { account_code: bank, debit_yen: 3_000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 1_500, tax_category: "taxable_10" },
        { account_code: "4100", debit_yen: 0, credit_yen: 1_500, tax_category: "taxable_8" },
      ],
    });
    appendJournalEntry({
      entry_id: "JE-CT-PURCHASES",
      occurred_at: "2026-06-15T00:00:00.000Z",
      description: "taxable purchases",
      source: { kind: "manual", authorized_by: "OP-CT" },
      evidence_refs: ["test:purchases"],
      lines: [
        {
          account_code: "5100",
          debit_yen: 1_000,
          credit_yen: 0,
          tax_category: "taxable_10",
          invoice_status: "qualified",
          purchase_use: "taxable_only",
        },
        {
          account_code: "5100",
          debit_yen: 1_000,
          credit_yen: 0,
          tax_category: "taxable_8",
          invoice_status: "qualified",
          purchase_use: "taxable_only",
        },
        { account_code: bank, debit_yen: 0, credit_yen: 2_000, tax_category: "out_of_scope" },
      ],
    });
    const rows = buildFiscalYearConsumptionTaxReturnRows("FY2026");
    const pass = expected.expect.every(
      (line) => amount(rows, line.sheet, line.line) === line.amount_yen
    );
    return {
      pass,
      detail: pass ? "journal entries alone filled the cited lines" : "journal amounts diverged",
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  } finally {
    restoreEnv(originalWorkspace, originalSkip);
    if (originalTenant) setTenantId(originalTenant);
    else clearTenantId();
    rmSync(workspace, { recursive: true, force: true });
  }
}

function externalGolden(
  mapping: ConsumptionTaxReturnMap,
  golden: Golden
): { pass: boolean; detail: string } {
  if (!golden.cases.every((row) => citationAccepted(row.citation)))
    return fail("golden citation is empty");
  if (citationAccepted("") || citationAccepted("projector-output")) {
    return fail("write-back citation was accepted");
  }
  for (const row of golden.cases) {
    const projected = project(mapping, row.bases, {
      lines: row.purchases.lines,
      ratio: row.purchases.ratio,
      taxable_sales_yen: row.purchases.taxable_sales_yen,
    });
    for (const line of row.expect) {
      if (amount(projected, line.sheet, line.line) !== line.amount_yen) {
        return fail(`${row.id} ${line.sheet} ${line.line} diverged from the literal`);
      }
    }
  }
  return { pass: true, detail: "golden literals match and empty citations do not" };
}

function projectCase(mapping: ConsumptionTaxReturnMap, id: string): ConsumptionTaxReturnRows {
  const golden = readYamlFile(fixturePath("golden.yaml"), goldenSchema);
  const row = golden.cases.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`missing golden case ${id}`);
  return project(mapping, row.bases, {
    lines: row.purchases.lines,
    ratio: row.purchases.ratio,
    taxable_sales_yen: row.purchases.taxable_sales_yen,
  });
}

function project(
  mapping: ConsumptionTaxReturnMap,
  bases: ConsumptionTaxReturnBases,
  purchases: ConsumptionTaxPurchaseContext = { lines: [] }
): ConsumptionTaxReturnRows {
  return projectConsumptionTaxReturnRows({ mapping, bases, purchases, method: "standard" });
}

function creditAmount(
  mapping: ConsumptionTaxReturnMap,
  line: ConsumptionTaxPurchaseContext["lines"][number],
  ratio?: { taxable_yen: number; total_yen: number },
  taxableSalesYen = 1_000
): number | null {
  const rows = project(mapping, salesOf(taxableSalesYen), {
    lines: [line],
    ratio,
    taxable_sales_yen: taxableSalesYen,
  });
  return amount(rows, "schedule_2_3", "㉖");
}

function qualifiedLine(
  occurredOn: string,
  invoiceStatus: "qualified" | "nonqualified_80" | "nonqualified_70" | "nonqualified_50",
  baseYen = 1_000
): ConsumptionTaxPurchaseContext["lines"][number] {
  return {
    occurred_on: occurredOn,
    tax_category: "taxable_10",
    base_yen: baseYen,
    invoice_status: invoiceStatus,
    purchase_use: "taxable_only",
  };
}

function salesOf(amountYen: number): ConsumptionTaxReturnBases {
  return { taxable_sales_10_yen: amountYen, taxable_sales_8_yen: 0 };
}

function amount(rows: ConsumptionTaxReturnRows, sheet: string, line: string): number | null {
  const found = rows.rows.find((row) => row.sheet === sheet && row.line === line);
  return found?.row_status === "filled" ? found.amount_yen : null;
}

function citationAccepted(citation: string): boolean {
  const trimmed = citation.trim();
  return trimmed.length > 0 && trimmed !== "projector-output";
}

function key(sheet: string, line: string): string {
  return `${sheet}:${line}`;
}

function fail(detail: string): { pass: boolean; detail: string } {
  return { pass: false, detail };
}

function check(
  id: string,
  weight: number,
  result: { pass: boolean; detail: string }
): ConsumptionTaxReturnCheck {
  return { id, weight, pass: result.pass, detail: result.detail };
}

function fixturePath(name: string): string {
  return join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../tests/fixtures/consumption-tax-return",
    name
  );
}

function currentTenant(): string | null {
  try {
    return getTenantId();
  } catch {
    return null;
  }
}

function restoreEnv(workspace: string | undefined, skipBackup: string | undefined): void {
  if (workspace === undefined) delete process.env.ORGOS_WORKSPACE;
  else process.env.ORGOS_WORKSPACE = workspace;
  if (skipBackup === undefined) delete process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
  else process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = skipBackup;
  refreshOrgOsPaths();
}
