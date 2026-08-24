import {
  buildHeadcountView,
  formatHeadcountMarkdown,
} from "../lib/hr/headcount-view.js";

export function runHrHeadcount(options?: { json?: boolean }): void {
  const view = buildHeadcountView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatHeadcountMarkdown(view));
}
