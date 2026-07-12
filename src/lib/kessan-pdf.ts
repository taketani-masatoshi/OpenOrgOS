import { join } from "node:path";
import type { YojitsuPlan } from "../../schemas/finance.js";
import type { Company } from "../../schemas/company.js";
import {
  aggregateBySegment,
  lineDisplayLabel,
  resolveYojitsuMonthSide,
  sumOperatingExpenses,
} from "./yojitsu-normalize.js";
import {
  createPdfWriter,
  fiscalPeriodLabel,
  fiscalYearNumber,
  pdfMetaBlock,
  pdfParagraph,
  pdfSection,
  pdfSignatureBlock,
  pdfTable,
  pdfTitle,
  writePdfToFile,
  type PdfTableRow,
} from "./pdf.js";
import { ensurePdfOutputDir, formatJapaneseDate } from "./utils.js";

export interface KessanReportInput {
  company: Company;
  yojitsu: YojitsuPlan;
  fiscalYear: string;
}

export function buildKessanPlRows(yojitsu: YojitsuPlan): PdfTableRow[] {
  const revenueBySegment = aggregateBySegment(yojitsu, "revenue", true);
  const revenueTotal =
    yojitsu.summary?.revenue_total ?? [...revenueBySegment.values()].reduce((a, b) => a + b, 0);

  const expenseByLabel = new Map<string, number>();
  for (const month of yojitsu.months) {
    const side = resolveYojitsuMonthSide(month);
    for (const line of side.lines) {
      if (line.kind === "expense" || line.kind === "depreciation") {
        const label = lineDisplayLabel(line);
        expenseByLabel.set(label, (expenseByLabel.get(label) ?? 0) + line.amount);
      }
    }
  }

  const sgaTotal =
    [...expenseByLabel.values()].reduce((a, b) => a + b, 0) ||
    yojitsu.months.reduce((s, m) => s + sumOperatingExpenses(resolveYojitsuMonthSide(m)), 0);

  const operatingProfit = yojitsu.summary?.operating_profit ?? revenueTotal - sgaTotal;
  const pretaxProfit = yojitsu.summary?.pretax_profit ?? operatingProfit;
  const taxEstimate = yojitsu.summary?.tax_estimate ?? 0;
  const netProfit = yojitsu.summary?.net_profit ?? pretaxProfit - taxEstimate;

  const rows: PdfTableRow[] = [
    { label: "【損益計算書】", amount: "", bold: true },
    { label: "Ⅰ. 売上高", amount: "", bold: true },
  ];

  for (const [segment, amount] of [...revenueBySegment.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "ja")
  )) {
    if (amount > 0) {
      rows.push({ label: segment, amount, indent: 1 });
    }
  }

  rows.push(
    { label: "売上高 合計", amount: revenueTotal, bold: true },
    { label: "Ⅱ. 売上原価", amount: 0 },
    { label: "売上総利益", amount: revenueTotal, bold: true },
    { label: "Ⅲ. 販売費及び一般管理費", amount: "", bold: true }
  );

  for (const [label, amount] of [...expenseByLabel.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "ja")
  )) {
    if (amount > 0) {
      rows.push({ label, amount, indent: 1 });
    }
  }

  rows.push(
    { label: "販管費 合計", amount: sgaTotal, bold: true },
    { label: "Ⅳ. 営業利益", amount: operatingProfit, bold: true },
    { label: "Ⅴ. 営業外収益", amount: 0 },
    { label: "Ⅵ. 営業外費用", amount: 0 },
    { label: "経常利益", amount: pretaxProfit, bold: true },
    { label: "Ⅶ. 特別利益", amount: 0 },
    { label: "Ⅷ. 特別損失", amount: 0 },
    { label: "税引前当期純利益", amount: pretaxProfit, bold: true },
    { label: "Ⅸ. 法人税等", amount: taxEstimate },
    { label: "当期純利益", amount: netProfit, bold: true }
  );

  return rows;
}

export async function generateKessanPdf(
  input: KessanReportInput,
  outputPath?: string
): Promise<string> {
  const { company, yojitsu, fiscalYear } = input;
  const periodFrom = yojitsu.period_from ?? "";
  const periodTo = yojitsu.period_to ?? "";
  const periodLabel = fiscalPeriodLabel(periodFrom, periodTo);
  const termNumber = fiscalYearNumber(company.established_date, periodTo);
  const closedAt = yojitsu.closing?.closed_at ?? "2027-02-15";

  const basisNote =
    yojitsu.closing?.basis === "forecast" ? "（本報告書は予想ベースの決算数値に基づく）" : "";

  const path = outputPath ?? join(ensurePdfOutputDir("kessan"), `${fiscalYear}-kessan-hokoku.pdf`);

  const w = createPdfWriter();

  pdfTitle(w, "決　算　報　告　書");
  pdfMetaBlock(w, [
    { label: "商号", value: company.name },
    { label: "本店", value: company.address ?? "" },
    { label: "事業年度", value: `第${termNumber}期（${periodLabel}）` },
  ]);

  pdfParagraph(
    w,
    `当会社は、${periodLabel}の第${termNumber}期事業年度の計算書類等について、下記のとおり利益を有しましたので、決算報告いたします。${basisNote}`
  );

  pdfSection(w, "1. 損益の状況");
  pdfTable(w, buildKessanPlRows(yojitsu));

  pdfSection(w, "2. 剰余金の処分");
  pdfParagraph(w, "当期純利益は、内部留保として積み立てることといたします。（株主総会決議事項）");

  pdfSection(w, "3. 重要な会計方針");
  pdfParagraph(
    w,
    "減価償却は定額法により計上。番町ハイム312の取得価額1,660万円を耐用年数47年で償却。亀沢旅館の減価償却は当年度未計上。"
  );

  if (yojitsu.closing?.notes) {
    pdfSection(w, "4. 注記");
    pdfParagraph(w, yojitsu.closing.notes.trim());
  }

  const reps = (company.directors ?? [])
    .filter((d) => d.role?.includes("代表"))
    .map((d) => `${d.role ?? "代表取締役"}\u3000${d.name}\u3000㊞`);

  pdfSignatureBlock(
    w,
    formatJapaneseDate(closedAt),
    company.name,
    reps.length > 0 ? reps : [`代表取締役\u3000${company.representative ?? ""}\u3000㊞`]
  );

  await writePdfToFile(w.doc, path);
  return path;
}
