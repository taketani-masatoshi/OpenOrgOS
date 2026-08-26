import {
  formatCapTableReviewMarkdown,
  reviewCapTable,
} from "../../../../src/lib/investor-relations/cap-table.js";
import {
  buildIrBriefingSummary,
  formatIrBriefingMarkdown,
} from "../../../../src/lib/investor-relations/briefing.js";
import { buildIrBriefingView } from "../../../../src/lib/investor-relations/briefing-view.js";
import {
  collectCapitalRaiseIrCrossCheckIssues,
  formatCapitalRaiseCrossCheckMarkdown,
} from "../../../../src/lib/investor-relations/capital-raise-crosscheck.js";
import {
  expandDisclosureCalendar,
  formatDisclosureCalendarMarkdown,
} from "../../../../src/lib/investor-relations/disclosure-calendar.js";
import {
  IR_CAP_TABLE_FILE,
  IR_DISCLOSURE_CALENDAR_FILE,
  IR_INVESTOR_REGISTRY_FILE,
  IR_MATERIALS_FILE,
  IR_MODULE_ID,
} from "../../../../src/lib/investor-relations/constants.js";
import {
  getIrDataDir,
  loadIrCapTable,
  loadIrDisclosureCalendar,
  loadIrInvestorRegistry,
  loadIrMaterials,
} from "../../../../src/lib/investor-relations/load.js";
import { isModuleEnabled } from "../../../../src/lib/module-business-data.js";
import { currentDate, writeMarkdownReport } from "../../../../src/lib/utils.js";

export const MODULE_ID = IR_MODULE_ID;

export function runInvestorRelationsShow(opts: { json?: boolean }): void {
  const view = buildIrBriefingView();
  const payload = {
    module: MODULE_ID,
    enabled: view.module_enabled,
    data_dir: getIrDataDir(),
    coverage: view.coverage,
    cap_table_lines: view.cap_table_lines,
    cap_table_ok: view.cap_table_ok,
    investor_contacts: view.investor_contacts,
    materials: view.materials_count,
    upcoming_disclosures_90d: view.upcoming_disclosures,
    overdue_disclosures: view.overdue_disclosures,
    notes: view.notes,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# investor_relations\n`);
  if (view.coverage === "unregistered") {
    console.log(`status: unregistered — tenant data missing under ${payload.data_dir}`);
    for (const note of view.notes) console.log(`- ${note}`);
    return;
  }
  console.log(
    `cap table: ${payload.cap_table_lines} lines (${payload.cap_table_ok ? "OK" : "issues"}) · investors: ${payload.investor_contacts} · materials: ${payload.materials}`,
  );
  console.log(
    `upcoming disclosures (90d): ${payload.upcoming_disclosures_90d} · overdue: ${payload.overdue_disclosures}`,
  );
  console.log(`data: ${payload.data_dir}`);
}

export function runInvestorRelationsValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) {
    issues.push("module not enabled in modules.yaml");
  }

  const capLoaded = loadIrCapTable();
  if (!capLoaded) {
    issues.push(`${IR_CAP_TABLE_FILE} missing — copy from seed`);
  } else {
    const review = reviewCapTable(capLoaded.data);
    for (const issue of review.issues.filter((i) => i.level === "error")) {
      issues.push(`cap-table: ${issue.message}`);
    }
  }

  if (!loadIrInvestorRegistry()) {
    issues.push(`${IR_INVESTOR_REGISTRY_FILE} missing — copy from seed`);
  } else {
    const reg = loadIrInvestorRegistry()!;
    const ids = new Set<string>();
    for (const c of reg.data.contacts) {
      if (ids.has(c.id)) issues.push(`investor-registry: duplicate id ${c.id}`);
      ids.add(c.id);
    }
  }

  if (!loadIrDisclosureCalendar()) {
    issues.push(`${IR_DISCLOSURE_CALENDAR_FILE} missing — copy from seed`);
  } else {
    const cal = loadIrDisclosureCalendar()!;
    const ids = new Set<string>();
    for (const item of cal.data.items) {
      if (ids.has(item.id)) issues.push(`disclosure-calendar: duplicate id ${item.id}`);
      ids.add(item.id);
    }
  }

  if (!loadIrMaterials()) {
    issues.push(`${IR_MATERIALS_FILE} missing — copy from seed`);
  }

  const crossCheck = collectCapitalRaiseIrCrossCheckIssues(capLoaded?.data ?? null);
  for (const issue of crossCheck.filter((i) => i.level === "error")) {
    issues.push(issue.message);
  }
  const crossWarnings = crossCheck.filter((i) => i.level === "warning");

  if (issues.length) {
    console.error("✗ investor_relations:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  for (const warning of crossWarnings) {
    console.warn(`⚠ ${warning.message}`);
  }
  console.log("✓ investor_relations — cap table · registry · calendar · materials OK");
}

export function runInvestorRelationsBriefing(opts: {
  json?: boolean;
  output?: string;
  today?: string;
}): void {
  const today = opts.today ?? currentDate();
  const summary = buildIrBriefingSummary({
    capTable: loadIrCapTable()?.data ?? null,
    registry: loadIrInvestorRegistry()?.data ?? null,
    calendar: loadIrDisclosureCalendar()?.data ?? null,
    materials: loadIrMaterials()?.data ?? null,
    today,
  });

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const md = formatIrBriefingMarkdown(summary, { today });
  if (opts.output) {
    const path = writeMarkdownReport(
      "agent-summaries/investor-relations",
      opts.output,
      md,
    );
    console.log(`✓ ${path}`);
    return;
  }
  console.log(md);
}

export function runInvestorRelationsCapTableReview(opts: {
  json?: boolean;
  output?: string;
}): void {
  const loaded = loadIrCapTable();
  if (!loaded) {
    console.error(`${IR_CAP_TABLE_FILE} not found under ${getIrDataDir()}`);
    process.exit(1);
  }
  const result = reviewCapTable(loaded.data);
  const crossCheck = collectCapitalRaiseIrCrossCheckIssues(loaded.data);
  if (opts.json) {
    console.log(JSON.stringify({ ...result, capital_raise_cross_check: crossCheck }, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  const md = `${formatCapTableReviewMarkdown(result)}\n\n${formatCapitalRaiseCrossCheckMarkdown(crossCheck)}`;
  if (opts.output) {
    writeMarkdownReport(
      "agent-summaries/investor-relations",
      opts.output,
      md,
    );
  } else {
    console.log(md);
  }
  if (!result.ok) process.exit(1);
}

export function runInvestorRelationsDisclosureCalendar(opts: {
  json?: boolean;
  output?: string;
  today?: string;
  days?: number;
}): void {
  const loaded = loadIrDisclosureCalendar();
  if (!loaded) {
    console.error(`${IR_DISCLOSURE_CALENDAR_FILE} not found`);
    process.exit(1);
  }
  const today = opts.today ?? currentDate();
  const daysAhead = opts.days ?? 90;
  const items = expandDisclosureCalendar(loaded.data, { today, daysAhead });

  if (opts.json) {
    console.log(JSON.stringify({ today, daysAhead, items }, null, 2));
    return;
  }

  const md = formatDisclosureCalendarMarkdown(items, { today, daysAhead });
  if (opts.output) {
    writeMarkdownReport(
      "agent-summaries/investor-relations",
      opts.output,
      md,
    );
  } else {
    console.log(md);
  }
}
