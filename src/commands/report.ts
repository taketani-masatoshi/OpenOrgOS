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
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";
import { buildGlProfitLossSummary, buildGlKessanPlRows } from "../lib/finance/gl-report-basis.js";
import {
  buildGlEquityChangeRows,
  buildGlKessanBsRows,
} from "../lib/finance/ledger/balance-sheet.js";
import {
  buildComparativeBalanceSheet,
  buildComparativeProfitLoss,
  resolvePriorAsOf,
} from "../lib/finance/ledger/comparative-statements.js";
import { resolveDefaultFiscalYear } from "../lib/finance/fiscal-year.js";
import {
  fiscalYearEndDate,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear as resolveFiscalYearFromMonth,
} from "../lib/finance/fiscal-year.js";
import type { YojitsuPlan } from "../../schemas/finance.js";

function resolveFiscalYear(fy?: string): string {
  return resolveDefaultFiscalYear(fy);
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

function applyReportBasis(
  yojitsu: YojitsuPlan,
  fiscalYear: string,
  basis: "gl" | "yojitsu" = "gl",
): YojitsuPlan {
  if (basis === "yojitsu") return yojitsu;
  const gl = buildGlProfitLossSummary({ fiscalYear });
  return {
    ...yojitsu,
    summary: {
      ...yojitsu.summary,
      revenue_total: gl.revenue_total,
      operating_profit: gl.operating_profit,
      pretax_profit: gl.pretax_profit,
      net_profit: gl.net_profit,
    },
    closing: {
      status: yojitsu.closing?.status ?? "open",
      ...yojitsu.closing,
      basis: "gl",
      notes: `GL連動（試算表 as_of ${gl.as_of}）。${yojitsu.closing?.notes ?? ""}`.trim(),
    },
  };
}

export async function runReportKessan(options: {
  fy?: string;
  output?: string;
  basis?: "gl" | "yojitsu";
  compare?: boolean;
  priorYear?: boolean;
}): Promise<void> {
  requireCliReportWrite("report kessan");
  const fiscalYear = resolveFiscalYear(options.fy);
  const data = loadReportData(fiscalYear);
  const yojitsuBase = data.yojitsu;
  const basis = options.basis ?? "gl";
  const yojitsu = applyReportBasis(yojitsuBase, fiscalYear, basis);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf =
    yojitsu.period_to && yojitsu.period_to.length >= 10
      ? yojitsu.period_to.slice(0, 10)
      : fiscalYearEndDate(fiscalYear, endMonth);
  const priorAsOf = options.priorYear
    ? resolvePriorAsOf({ fiscalYear, asOf })
    : undefined;
  const priorFy = priorAsOf
    ? resolveFiscalYearFromMonth(endMonth, priorAsOf.slice(0, 7))
    : undefined;

  if (options.compare) {
    const gl = buildGlProfitLossSummary({ fiscalYear });
    const planRevenue = yojitsuBase.months.reduce(
      (sum, ym) => sum + (ym.plan && "lines" in ym.plan
        ? ym.plan.lines.filter((l) => l.kind === "revenue").reduce((s, l) => s + l.amount, 0)
        : 0),
      0,
    ) || (yojitsuBase.summary?.revenue_total ?? 0);
    const planOperating = yojitsuBase.summary?.operating_profit ?? 0;
    console.log("# Plan vs GL actual (予実差異)");
    console.log(
      `revenue: gl=${gl.revenue_total.toLocaleString()} plan=${planRevenue.toLocaleString()} delta=${(gl.revenue_total - planRevenue).toLocaleString()}`,
    );
    console.log(
      `operating_profit: gl=${gl.operating_profit.toLocaleString()} plan=${planOperating.toLocaleString()} delta=${(gl.operating_profit - planOperating).toLocaleString()}`,
    );
  }

  if (options.priorYear) {
    const cmpBs = buildComparativeBalanceSheet({ asOf, fiscalYear, priorAsOf });
    const cmpPl = buildComparativeProfitLoss({
      fiscalYear,
      asOf,
      priorAsOf,
    });
    console.log("# Prior-year comparative (前期比較)");
    console.log(
      `assets: current=${cmpBs.total_assets_yen.current.toLocaleString()} prior=${cmpBs.total_assets_yen.prior.toLocaleString()} delta=${cmpBs.total_assets_yen.delta.toLocaleString()}`,
    );
    console.log(
      `net_profit: current=${cmpPl.net_profit.current.toLocaleString()} prior=${cmpPl.net_profit.prior.toLocaleString()} delta=${cmpPl.net_profit.delta.toLocaleString()}`,
    );
  }

  const plRows =
    basis === "gl"
      ? buildGlKessanPlRows({
          fiscalYear,
          asOf,
          ...(priorAsOf && priorFy
            ? { priorAsOf, priorFiscalYear: priorFy }
            : {}),
        })
      : undefined;
  const filename = options.output ?? `${fiscalYear}-kessan-hokoku.pdf`;
  const outputPath = filename.includes("/")
    ? filename
    : join(ensurePdfOutputDir("kessan"), filename);

  const path = await generateKessanPdf(
    {
      ...data,
      yojitsu,
      fiscalYear,
      plRows,
      ...(basis === "gl"
        ? {
            bsRows: buildGlKessanBsRows({
              fiscalYear,
              asOf,
              ...(priorAsOf ? { priorAsOf } : {}),
            }),
            equityRows: buildGlEquityChangeRows({ fiscalYear, asOf }),
            noteRows: [
              "貸借対照表の当期純利益は税引後です。",
              "未計上月の月次 YAML は予実差異であり、GL を埋めません。",
              ...(priorAsOf
                ? [`前期比較列: prior_as_of ${priorAsOf}`]
                : []),
            ],
          }
        : {}),
    },
    outputPath
  );
  initDocumentIoFile();
  const basisFlag = options.basis ? ` --basis ${options.basis}` : "";
  const priorFlag = options.priorYear ? " --prior-year" : "";
  registerGeneratedPdf(
    path,
    "corporate",
    `report kessan --fy ${fiscalYear}${basisFlag}${priorFlag}`,
    "kessan",
  );
  console.log(`✓ 決算報告書 PDF: ${path}`);
}

export async function runReportJigyo(options: {
  fy?: string;
  output?: string;
  basis?: "gl" | "yojitsu";
}): Promise<void> {
  requireCliReportWrite("report jigyo");
  const fiscalYear = resolveFiscalYear(options.fy);
  const data = loadReportData(fiscalYear);
  const yojitsu = applyReportBasis(data.yojitsu, fiscalYear, options.basis ?? "gl");
  const filename = options.output ?? `${fiscalYear}-jigyo-hokoku.pdf`;
  const outputPath = filename.includes("/")
    ? filename
    : join(ensurePdfOutputDir("jigyo"), filename);

  const path = await generateJigyoPdf(
    { ...data, yojitsu, fiscalYear },
    outputPath
  );
  initDocumentIoFile();
  const basisFlag = options.basis ? ` --basis ${options.basis}` : "";
  registerGeneratedPdf(path, "corporate", `report jigyo --fy ${fiscalYear}${basisFlag}`, "jigyo");
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
  requireCliReportWrite("report monthly");
  const data = loadAllData();
  const month = options.month ?? currentMonth();
  const report = generateMonthlyReport(data, month);
  const filename = options.output ?? `${month}.md`;

  const path = writeMarkdownReport("monthly", filename, report);
  console.log(`✓ Monthly report saved to ${path}`);
  console.log(report);
}
