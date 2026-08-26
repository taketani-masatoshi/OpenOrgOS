// @catalog-ids: investor_relations
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { collectIrIntegrityIssues } from "../src/lib/investor-relations/integrity.js";
import { buildIrBriefingView } from "../src/lib/investor-relations/briefing-view.js";
import { loadIrCapTable } from "../src/lib/investor-relations/load.js";
import { collectCapitalRaiseIrCrossCheckIssues } from "../src/lib/investor-relations/capital-raise-crosscheck.js";
import { investorRelationsBriefingProvider } from "../src/lib/operator-facts/providers/investor-relations-briefing.js";
import { matchProviderByIntent } from "../src/lib/operator-facts/registry.js";
import { runInvestorRelationsShow } from "../steward/modules/investor_relations/cli/lib.js";
import { runFinancesCapitalRaiseCrossCheck } from "../src/commands/finances-capital-raise-crosscheck.js";
import {
  buildTodayContext,
  formatTodayContextMarkdown,
} from "../src/lib/steward-chat/today-context.js";
import { computeDashboard } from "../src/lib/dashboard.js";
import { readYamlFile } from "../src/lib/utils.js";
import { capTableFileSchema } from "../schemas/investor-relations/index.js";
import type { CapitalRaiseCase } from "../schemas/finance/capital-raise-case.js";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

function captureJsonShow(run: (opts: { json?: boolean }) => void): Record<string, unknown> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  run({ json: true });
  spy.mockRestore();
  return JSON.parse(lines.join("\n"));
}

describe("investor-relations integration", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("show reads tenant data only (not seed fallback)", () => {
    const payload = captureJsonShow(runInvestorRelationsShow);
    expect(payload.coverage).toBe("registered");
    expect(payload.cap_table_lines).toBe(3);
    expect(payload.upcoming_disclosures_90d).toBeGreaterThan(0);
  });

  it("collectIrIntegrityIssues passes for mal tenant", () => {
    const errors = collectIrIntegrityIssues().filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("buildIrBriefingView exposes upcoming disclosures", () => {
    const view = buildIrBriefingView({ asOf: "2026-08-24" });
    expect(view.coverage).toBe("registered");
    expect(view.upcoming_disclosures).toBeGreaterThan(0);
  });

  it("registers operator_ir_briefing fact provider", () => {
    const provider = matchProviderByIntent("IR の開示予定は？");
    expect(provider?.toolName).toBe("operator_ir_briefing");
    const result = investorRelationsBriefingProvider.run();
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("Cap table");
  });

  it("collectCapitalRaiseIrCrossCheckIssues is safe without finance cases", () => {
    expect(collectCapitalRaiseIrCrossCheckIssues(seedCapTable())).toEqual([]);
  });

  it("flags a closed raise holder that is absent from the IR cap table", () => {
    const issues = collectCapitalRaiseIrCrossCheckIssues(seedCapTable(), {
      cases: [buildCase({ holder_ref: "STK-INV-999", fully_diluted_pct: 5 })],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("error");
    expect(issues[0]!.message).toContain("STK-INV-999");
  });

  it("flags fully_diluted_pct drift between capital-raise and IR cap table", () => {
    const issues = collectCapitalRaiseIrCrossCheckIssues(seedCapTable(), {
      cases: [
        buildCase({ stage: "term_sheet", holder_ref: "STK-INV-001", fully_diluted_pct: 22 }),
      ],
    });
    expect(issues.some((issue) => issue.message.includes("22%"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("overlapping fully_diluted_pct total"))).toBe(
      true,
    );
  });

  it("exposes finance CLI capital-raise-crosscheck JSON", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      lines.push(String(msg));
    });
    runFinancesCapitalRaiseCrossCheck({ json: true });
    spy.mockRestore();
    const payload = JSON.parse(lines.join("\n")) as { issues: unknown[] };
    expect(Array.isArray(payload.issues)).toBe(true);
  });

  it("Today markdown carries the deterministic IR section", () => {
    const markdown = formatTodayContextMarkdown(buildTodayContext());
    expect(markdown).toContain("## IR KPI");
    expect(markdown).toContain("cap table: 3 行");
  });

  it("dashboard exposes an IR disclosure KPI", () => {
    const kpi = computeDashboard().kpis.find((entry) => entry.id === "ir_disclosure");
    expect(kpi?.label).toBe("開示予定（90日）");
  });

  it("treats acme (.example only) as unregistered", () => {
    setTenantId("acme");
    expect(loadIrCapTable()).toBeNull();
    const view = buildIrBriefingView({ asOf: "2026-08-24" });
    expect(view.coverage).toBe("unregistered");
    expect(view.module_enabled).toBe(false);
    expect(view.cap_table_lines).toBe(0);

    const show = captureJsonShow(runInvestorRelationsShow);
    expect(show.coverage).toBe("unregistered");

    expect(collectIrIntegrityIssues()).toEqual([]);
    expect(formatTodayContextMarkdown(buildTodayContext())).not.toContain("## IR KPI");
    expect(computeDashboard().kpis.some((entry) => entry.id === "ir_disclosure")).toBe(false);
  });
});

function seedCapTable() {
  return readYamlFile(
    join(ROOT_DIR, "steward/modules/investor_relations/seed/cap-table.yaml.example"),
    capTableFileSchema,
  );
}

function buildCase(line: {
  stage?: CapitalRaiseCase["stage"];
  holder_ref: string;
  fully_diluted_pct: number;
}): CapitalRaiseCase {
  return {
    case_id: "CASE-FR-001",
    stage: line.stage ?? "closed",
    cap_table: [
      {
        holder_ref: line.holder_ref,
        security_type: "preferred",
        fully_diluted_pct: line.fully_diluted_pct,
      },
    ],
  } as CapitalRaiseCase;
}
