import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import { vcFundsFileSchema, vcPortfolioFileSchema } from "../../../../schemas/business-modules.js";

export const MODULE_ID = "venture_capital";

export function runVentureCapitalShow(opts: { json?: boolean }): void {
  const funds = loadModuleDataFile(MODULE_ID, "funds.yaml", vcFundsFileSchema);
  const portfolio = loadModuleDataFile(MODULE_ID, "portfolio.yaml", vcPortfolioFileSchema);
  const investing = funds?.data.funds.filter((f) => f.status === "investing").length ?? 0;
  const activeCo = portfolio?.data.companies.filter((p) => p.status === "active").length ?? 0;
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    funds: funds?.data.funds.length ?? 0,
    investing_funds: investing,
    portfolio_companies: portfolio?.data.companies.length ?? 0,
    active_portfolio: activeCo,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# venture_capital\n`);
  console.log(`funds: ${summary.funds} (investing: ${summary.investing_funds}) · portfolio: ${summary.active_portfolio}/${summary.portfolio_companies} active`);
}

export function runVentureCapitalValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  if (!loadModuleDataFile(MODULE_ID, "funds.yaml", vcFundsFileSchema)) issues.push("funds.yaml missing");
  const portfolio = loadModuleDataFile(MODULE_ID, "portfolio.yaml", vcPortfolioFileSchema);
  const funds = loadModuleDataFile(MODULE_ID, "funds.yaml", vcFundsFileSchema);
  if (portfolio && funds) {
    const fundIds = new Set(funds.data.funds.map((f) => f.id));
    for (const p of portfolio.data.companies) {
      if (!fundIds.has(p.fund_id)) issues.push(`${p.id}: unknown fund_id ${p.fund_id}`);
    }
  }
  if (issues.length) {
    console.error("✗ venture_capital:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ venture_capital — funds/portfolio OK");
}

export function runVentureCapitalAction(_opts: Record<string, unknown>): void {
  const funds = loadModuleDataFile(MODULE_ID, "funds.yaml", vcFundsFileSchema);
  const portfolio = loadModuleDataFile(MODULE_ID, "portfolio.yaml", vcPortfolioFileSchema);
  console.log("# IC summary\n");
  if (funds) {
    for (const f of funds.data.funds) {
      console.log(`## ${f.id} ${f.name} (${f.status})`);
      if (f.committed_jpy != null && f.called_jpy != null) {
        const pct = f.committed_jpy ? Math.round((f.called_jpy / f.committed_jpy) * 100) : 0;
        console.log(`- called ${pct}% of committed`);
      }
      const cos = portfolio?.data.companies.filter((p) => p.fund_id === f.id && p.status === "active") ?? [];
      console.log(`- active companies: ${cos.length}`);
      for (const c of cos.slice(0, 5)) {
        console.log(`  · ${c.name}${c.stage ? ` (${c.stage})` : ""}`);
      }
    }
  }
}
