/**
 * 別表四 worked-example pin, empty-diff scoring, and amount roll-up.
 */
import {
  FORM_BETSU_4,
  REIWA6_SCHEDULE4_EXAMPLE_INCOME_YEN,
  SCHEDULE_4_LINES,
  type OfficialAnnexLine,
  type TaxAdjustmentWorksheetLine,
} from "./corporate-tax-annex.js";

export function betsu4(row: string, label: string, amountYen: number): OfficialAnnexLine {
  const line: OfficialAnnexLine = {
    form: FORM_BETSU_4,
    row,
    col: "1",
    label,
    amount_yen: amountYen,
  };
  if ((row === "46" || row === "49") && amountYen === 0) {
    line.blank_reason = "該当なし";
  }
  return line;
}
export function schedule4AgriculturalReserveExample(): OfficialAnnexLine[] {
  const amounts = schedule4Amounts({
    starting: 150,
    depreciationExcess: 0,
    entertainmentExcess: 0,
    mappedExplicit: [
      {
        id: "agri-reserve-add",
        kind: "add",
        amount_yen: 50,
        source: "explicit",
        label: "損金経理をした農業経営基盤強化準備金積立額",
        form: FORM_BETSU_4,
        row: "10",
      },
      {
        id: "loss-deduction",
        kind: "subtract",
        amount_yen: 100,
        source: "explicit",
        label: "欠損金等の当期控除額",
        form: FORM_BETSU_4,
        row: "44",
      },
      {
        id: "agri-reserve-sub",
        kind: "subtract",
        amount_yen: 50,
        source: "explicit",
        label: "農業経営基盤強化準備金積立額の損金算入額",
        form: FORM_BETSU_4,
        row: "47",
      },
    ],
  });
  return SCHEDULE_4_LINES.map((line) =>
    betsu4(line.row, line.label, schedule4Amount(amounts, line.row)),
  );
}

/**
 * 12 only when rows 46 and 49 stay on the sheet with 該当なし at 0 yen,
 * and line 52 equals the printed example income (not a label-only pin).
 */
export function scoreSchedule4WorkedExample(
  lines: readonly OfficialAnnexLine[],
  exampleIncomeYen: number | null,
): 0 | 12 {
  const sheet = lines.filter((line) => line.form === FORM_BETSU_4);
  const row46 = sheet.find((line) => line.row === "46");
  const row49 = sheet.find((line) => line.row === "49");
  const row52 = sheet.find((line) => line.row === "52");
  if (!row46 || !row49 || !row52) return 0;
  if (row46.amount_yen === 0 && row46.blank_reason !== "該当なし") return 0;
  if (row49.amount_yen === 0 && row49.blank_reason !== "該当なし") return 0;
  if (exampleIncomeYen == null || row52.amount_yen !== exampleIncomeYen) return 0;
  return 12;
}

function schedule4OfficialKey(line: OfficialAnnexLine): string {
  return `${line.row}\t${line.label}\t${line.amount_yen}\t${line.blank_reason ?? ""}`;
}

/**
 * 申告投影の別表四と令和6年記載例ピンの差分。空なら法定照合の証拠になる。
 * 行ラベルだけの自己ピンはここで空にならない。
 */
export function diffSchedule4OfficialExample(
  product: readonly OfficialAnnexLine[],
  official: readonly OfficialAnnexLine[] = schedule4AgriculturalReserveExample(),
): string[] {
  const productSheet = product.filter((line) => line.form === FORM_BETSU_4);
  const officialSheet = official.filter((line) => line.form === FORM_BETSU_4);
  const productKeys = new Set(productSheet.map(schedule4OfficialKey));
  const officialKeys = new Set(officialSheet.map(schedule4OfficialKey));
  const diff: string[] = [];
  const productRows = productSheet.map((line) => line.row);
  if (new Set(productRows).size !== productRows.length) diff.push("duplicate 別表四");
  for (const line of officialSheet) {
    if (!productKeys.has(schedule4OfficialKey(line))) {
      diff.push(`missing ${line.row} ${line.label} ${line.amount_yen}`);
    }
  }
  for (const line of productSheet) {
    if (!officialKeys.has(schedule4OfficialKey(line))) {
      diff.push(`extra ${line.row} ${line.label} ${line.amount_yen}`);
    }
  }
  return diff;
}

/** 申告投影が令和6年記載例と空差分で、記載例スコアが 12 のときだけ法定充足。 */
export function schedule4StatutoryMet(officialLines: readonly OfficialAnnexLine[]): boolean {
  return (
    diffSchedule4OfficialExample(officialLines).length === 0 &&
    scoreSchedule4WorkedExample(officialLines, REIWA6_SCHEDULE4_EXAMPLE_INCOME_YEN) === 12
  );
}
export function schedule4Amount(amounts: Map<string, number>, row: string): number {
  return amounts.get(row) ?? 0;
}

/** 行23の仮計から行24–51を通り、行52を別計算する。未計算の法定行は 0。 */
export function schedule4Amounts(input: {
  starting: number;
  depreciationExcess: number;
  entertainmentExcess: number;
  mappedExplicit: TaxAdjustmentWorksheetLine[];
}): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const line of SCHEDULE_4_LINES) amounts.set(line.row, 0);
  amounts.set("1", input.starting);
  amounts.set("6", input.depreciationExcess);
  amounts.set("8", input.entertainmentExcess);
  for (const line of input.mappedExplicit) {
    if (!line.row) continue;
    amounts.set(line.row, schedule4Amount(amounts, line.row) + line.amount_yen);
  }
  const additionRows = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const subtractionRows = ["12", "13", "14", "15", "16", "17", "18", "19", "20", "21"];
  const additions = additionRows.reduce((sum, row) => sum + schedule4Amount(amounts, row), 0);
  const subtractions = subtractionRows.reduce((sum, row) => sum + schedule4Amount(amounts, row), 0);
  amounts.set("11", additions);
  amounts.set("22", subtractions);
  const provisional = schedule4Amount(amounts, "1") + additions - subtractions;
  amounts.set("23", provisional);
  const afterInterest =
    provisional + schedule4Amount(amounts, "24") - schedule4Amount(amounts, "25");
  amounts.set("26", afterInterest);
  const combined =
    afterInterest +
    schedule4Amount(amounts, "27") +
    schedule4Amount(amounts, "28") +
    schedule4Amount(amounts, "29") +
    schedule4Amount(amounts, "30") +
    schedule4Amount(amounts, "31") +
    schedule4Amount(amounts, "32") +
    schedule4Amount(amounts, "33");
  amounts.set("34", combined);
  const afterDistribution =
    combined +
    schedule4Amount(amounts, "35") -
    schedule4Amount(amounts, "36") +
    schedule4Amount(amounts, "37") +
    schedule4Amount(amounts, "38");
  amounts.set("39", afterDistribution);
  const afterGroup =
    afterDistribution -
    schedule4Amount(amounts, "40") +
    schedule4Amount(amounts, "41") +
    schedule4Amount(amounts, "42");
  amounts.set("43", afterGroup);
  const total = afterGroup - schedule4Amount(amounts, "44");
  amounts.set("45", total);
  const income =
    total -
    schedule4Amount(amounts, "46") -
    schedule4Amount(amounts, "47") -
    schedule4Amount(amounts, "48") -
    schedule4Amount(amounts, "49") +
    schedule4Amount(amounts, "50") -
    schedule4Amount(amounts, "51");
  amounts.set("52", income);
  return amounts;
}
