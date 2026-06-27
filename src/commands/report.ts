import { join } from "node:path";
import {
  loadBusinessPlan,
  loadProperties,
  loadLoans,
  loadYojitsuFyPlan,
  loadAllData,
} from "../lib/data.js";
import { loadOrgCompanyReport } from "../lib/org/tenant-data.js";
import type { Company } from "../../schemas/company.js";
import { generateKessanPdf } from "../lib/kessan-pdf.js";
import { generateJigyoPdf } from "../lib/jigyo-pdf.js";
import { generateMonthlyReport } from "../lib/report.js";
import { writeMarkdownReport, currentMonth, ensurePdfOutputDir } from "../lib/utils.js";
import { initDocumentIoFile, registerGeneratedPdf } from "../lib/document-io.js";

function resolveFiscalYear(fy?: string): string {
  return (fy ?? "FY2026").toUpperCase();
}

function loadReportData(fiscalYear: string) {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  if (!yojitsu) {
    throw new Error(
      `Yojitsu plan not found for ${fiscalYear}. Expected data/plans/yojitsu-${fiscalYear.toLowerCase()}.yaml`
    );
  }
  if (yojitsu.closing?.status !== "closed") {
    console.warn(`⚠ ${fiscalYear} is not marked as closed in yojitsu plan.`);
  }
  return {
    company: loadOrgCompanyReport() as Company,
    yojitsu,
    businessPlan: loadBusinessPlan(),
    properties: loadProperties(),
    loans: loadLoans(),
  };
}

export async function runReportKessan(options: {
  fy?: string;
  output?: string;
}): Promise<void> {
  const fiscalYear = resolveFiscalYear(options.fy);
  const data = loadReportData(fiscalYear);
  const filename = options.output ?? `${fiscalYear}-kessan-hokoku.pdf`;
  const outputPath = filename.includes("/")
    ? filename
    : join(ensurePdfOutputDir("kessan"), filename);

  const path = await generateKessanPdf(
    { ...data, fiscalYear },
    outputPath
  );
  initDocumentIoFile();
  registerGeneratedPdf(path, "corporate", `report kessan --fy ${fiscalYear}`, "kessan");
  console.log(`✓ 決算報告書 PDF: ${path}`);
}

export async function runReportJigyo(options: {
  fy?: string;
  output?: string;
}): Promise<void> {
  const fiscalYear = resolveFiscalYear(options.fy);
  const data = loadReportData(fiscalYear);
  const filename = options.output ?? `${fiscalYear}-jigyo-hokoku.pdf`;
  const outputPath = filename.includes("/")
    ? filename
    : join(ensurePdfOutputDir("jigyo"), filename);

  const path = await generateJigyoPdf(
    { ...data, fiscalYear },
    outputPath
  );
  initDocumentIoFile();
  registerGeneratedPdf(path, "corporate", `report jigyo --fy ${fiscalYear}`, "jigyo");
  console.log(`✓ 事業報告書 PDF: ${path}`);
}

export async function runReportAnnual(options: {
  fy?: string;
}): Promise<void> {
  await runReportKessan({ fy: options.fy });
  await runReportJigyo({ fy: options.fy });
}

export function runReportMonthly(options: {
  month?: string;
  output?: string;
}): void {
  const data = loadAllData();
  const month = options.month ?? currentMonth();
  const report = generateMonthlyReport(data, month);
  const filename = options.output ?? `${month}.md`;

  const path = writeMarkdownReport("monthly", filename, report);
  console.log(`✓ Monthly report saved to ${path}`);
  console.log(report);
}
