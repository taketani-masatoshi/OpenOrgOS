import { join } from "node:path";
import type { YojitsuPlan } from "../../schemas/finance.js";
import type { Company } from "../../schemas/company.js";
import type { BusinessPlan } from "../../schemas/finance.js";
import type { Property } from "../../schemas/property.js";
import type { Loans } from "../../schemas/finance.js";
import {
  createPdfWriter,
  fiscalPeriodLabel,
  fiscalYearNumber,
  pdfBulletList,
  pdfCoverHeader,
  pdfMetaBlock,
  pdfMutedNote,
  pdfParagraph,
  pdfSection,
  pdfSignatureBlock,
  pdfStatRow,
  pdfTable,
  writePdfToFile,
} from "./pdf.js";
import { ensurePdfOutputDir, formatCurrency, formatJapaneseDate } from "./utils.js";

export interface JigyoReportInput {
  company: Company;
  yojitsu: YojitsuPlan;
  businessPlan: BusinessPlan;
  properties: Property[];
  loans: Loans;
  fiscalYear: string;
}

export async function generateJigyoPdf(
  input: JigyoReportInput,
  outputPath?: string
): Promise<string> {
  const { company, yojitsu, businessPlan, properties, loans, fiscalYear } = input;
  const periodFrom = yojitsu.period_from ?? "";
  const periodTo = yojitsu.period_to ?? "";
  const periodLabel = fiscalPeriodLabel(periodFrom, periodTo);
  const termNumber = fiscalYearNumber(company.established_date, periodTo);
  const closedAt = yojitsu.closing?.closed_at ?? "2027-02-15";

  const revenue = yojitsu.summary?.revenue_total ?? 0;
  const operatingProfit = yojitsu.summary?.operating_profit ?? 0;
  const netProfit = yojitsu.summary?.net_profit ?? 0;

  const fyYear = businessPlan.years.find((y) => y.year === yojitsu.year);
  const investment = fyYear?.investment_plan ?? 0;

  const path =
    outputPath ??
    join(ensurePdfOutputDir("jigyo"), `${fiscalYear}-jigyo-hokoku.pdf`);

  const w = createPdfWriter();

  pdfCoverHeader(
    w,
    "事業報告書",
    `第${termNumber}期  ·  ${company.name}`
  );

  pdfMetaBlock(w, [
    { label: "事業年度", value: `第${termNumber}期（${periodLabel}）` },
    { label: "本店", value: company.address ?? "" },
    { label: "代表者", value: company.representative ?? "" },
  ]);

  pdfStatRow(w, [
    { label: "売上高", value: formatCurrency(revenue) },
    { label: "営業利益", value: formatCurrency(operatingProfit) },
    { label: "当期純利益", value: formatCurrency(netProfit) },
  ]);

  pdfSection(w, "1. 事業の経過及びその成果");
  pdfParagraph(
    w,
    company.business_description?.trim().split("\n")[0] ??
      "不動産賃貸・旅館運営及び関連サービス事業を行っております。"
  );
  if (businessPlan.vision) {
    pdfParagraph(w, businessPlan.vision.trim());
  }
  pdfParagraph(
    w,
    `当事業年度の売上高は${formatCurrency(revenue)}、営業利益は${formatCurrency(operatingProfit)}、当期純利益は${formatCurrency(netProfit)}となりました。`
  );

  if (yojitsu.closing?.basis === "forecast") {
    pdfMutedNote(w, "※ 当事業年度の数値は予想ベースで確定したものです。");
  } else if (yojitsu.closing?.basis === "actual") {
    pdfMutedNote(w, "※ 当事業年度の数値は月次実績の再構成に基づきます。");
  }

  pdfSection(w, "2. セグメント別の状況");
  for (const segment of businessPlan.segments) {
    pdfParagraph(w, segment.name, 10.5);
    if (segment.description) {
      pdfMutedNote(w, segment.description);
    }
  }

  pdfSection(w, "3. 物件の状況");
  for (const prop of properties) {
    const price =
      prop.acquisition_price != null
        ? formatCurrency(prop.acquisition_price)
        : "—";
    const kind = prop.type === "hotel" ? "旅館" : "賃貸";
    pdfParagraph(w, `${prop.name}`, 10.5);
    pdfMutedNote(w, `${prop.location}  ·  ${kind}  ·  取得 ${price}`);
  }

  pdfSection(w, "4. 設備投資の状況");
  pdfParagraph(
    w,
    `当事業年度の設備投資額は${formatCurrency(investment)}です。主な内容は亀沢旅館の上置き建築に係る支出です。`
  );

  pdfSection(w, "5. 借入金の状況");
  pdfTable(
    w,
    loans.loans.map((loan) => ({
      label: `${loan.id}  ${loan.lender}`,
      amount: loan.balance,
      note: loan.notes?.split("\n")[0],
      variant: "muted" as const,
    })),
    { labelWidth: w.contentWidth * 0.62 }
  );
  pdfMutedNote(w, "いずれも役員貸付による調達。返済条件は別途整理中。");

  pdfSection(w, "6. 中期目標及びKPI");
  if (businessPlan.mid_term_goals.length > 0) {
    pdfBulletList(w, businessPlan.mid_term_goals);
  }
  if (businessPlan.kpi.length > 0) {
    pdfParagraph(w, "主要KPI", 10);
    pdfBulletList(
      w,
      businessPlan.kpi.map((k) => `${k.name}: ${k.target}${k.unit ?? ""}`)
    );
  }

  pdfSection(w, "7. 従業員の状況");
  pdfParagraph(
    w,
    "当会社に使用する従業員はなく、代表取締役2名により業務を運営しております。"
  );

  pdfSection(w, "8. 重要な契約及び偶発事項");
  pdfParagraph(w, "訴訟事件、行政処分その他の重要な偶発事項はありません。");

  pdfSection(w, "9. 今後の方針");
  const nextYear = businessPlan.years.find((y) => y.year === yojitsu.year + 1);
  if (nextYear) {
    pdfParagraph(
      w,
      `翌事業年度の売上計画${formatCurrency(nextYear.revenue_plan)}、営業利益計画${formatCurrency(nextYear.operating_profit_plan)}に向け、物件稼働の安定化とサービス事業の収益化を進めます。`
    );
  }

  const reps = (company.directors ?? [])
    .filter((d) => d.role?.includes("代表"))
    .map((d) => `${d.role ?? "代表取締役"}　${d.name}　㊞`);

  pdfSignatureBlock(
    w,
    formatJapaneseDate(closedAt),
    company.name,
    reps.length > 0 ? reps : [`代表取締役　${company.representative ?? ""}　㊞`]
  );

  await writePdfToFile(w.doc, path);
  return path;
}
