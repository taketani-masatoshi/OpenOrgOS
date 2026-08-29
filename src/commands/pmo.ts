import {
  buildPmoMilestonesView,
  buildPmoPortfolioView,
  buildPmoRisksView,
  buildPmoShowView,
  formatPmoMilestonesMarkdown,
  formatPmoPortfolioMarkdown,
  formatPmoRisksMarkdown,
  formatPmoShowMarkdown,
} from "../lib/pmo/portfolio-view.js";

export function runPmoPortfolio(options?: { json?: boolean }): void {
  const view = buildPmoPortfolioView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatPmoPortfolioMarkdown(view));
}

export function runPmoMilestones(options?: { json?: boolean; days?: number }): void {
  const view = buildPmoMilestonesView({ days: options?.days });
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatPmoMilestonesMarkdown(view));
}

export function runPmoRisks(options?: { json?: boolean }): void {
  const view = buildPmoRisksView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatPmoRisksMarkdown(view));
}

export function runPmoShow(id: string, options?: { json?: boolean }): void {
  const view = buildPmoShowView(id);
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatPmoShowMarkdown(view));
  if (!view.found) {
    process.exitCode = 1;
  }
}
