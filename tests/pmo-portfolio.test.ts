import { describe, expect, it, beforeEach } from "vitest";
import {
  isPmoProjectId,
  pmoProjectSchema,
  pmoPortfolioFileSchema,
  usesForeignIdPrefix,
  PMO_FOREIGN_ID_PREFIXES,
} from "../schemas/projects/index.js";
import { collectPmoIntegrityIssues, loadPmoPortfolio } from "../src/lib/pmo/index.js";
import { collectPmoSchemaErrors } from "../src/lib/pmo/load.js";
import {
  buildPmoMilestonesView,
  buildPmoPortfolioView,
  buildPmoRisksView,
  buildPmoShowView,
  formatPmoCeoReply,
  formatPmoPortfolioMarkdown,
} from "../src/lib/pmo/portfolio-view.js";
import { resolveRegisteredSkillInvocation } from "../src/commands/skills.js";
import { clearSkillRegistryCache } from "../src/lib/skill-registry.js";
import {
  handleFactChatMessage,
  listFactProviders,
  matchProviderByIntent,
} from "../src/lib/operator-facts/index.js";
import { setTenantId } from "../src/lib/tenant.js";

const AS_OF = "2026-08-24";

describe("pmo id namespace", () => {
  it("accepts PRJ ids and rejects foreign prefixes", () => {
    expect(isPmoProjectId("PRJ-KAMEZAWA-OPS")).toBe(true);
    expect(isPmoProjectId("CTR-013")).toBe(false);
    expect(isPmoProjectId("APP-ANTIQUE-DEALER-001")).toBe(false);
    expect(isPmoProjectId("IMP-001")).toBe(false);
    expect(isPmoProjectId("PROP-001")).toBe(false);
    expect(usesForeignIdPrefix("CTR-013")).toBe(true);
    expect(usesForeignIdPrefix("PRJ-BANCHO-HQ")).toBe(false);
    expect(PMO_FOREIGN_ID_PREFIXES).toContain("CTR-");
    expect(PMO_FOREIGN_ID_PREFIXES).toContain("APP-");
    expect(PMO_FOREIGN_ID_PREFIXES).toContain("IMP-");
  });

  it("schema rejects colliding project ids", () => {
    const base = {
      title: "demo",
      status: "active" as const,
      rag: "green" as const,
      owner_agent: "operations" as const,
      sponsor: "ceo" as const,
    };
    expect(pmoProjectSchema.safeParse({ ...base, id: "PRJ-DEMO-001" }).success).toBe(true);
    expect(pmoProjectSchema.safeParse({ ...base, id: "CTR-013" }).success).toBe(false);
    expect(pmoProjectSchema.safeParse({ ...base, id: "APP-FOO" }).success).toBe(false);
    expect(
      pmoProjectSchema.safeParse({
        ...base,
        id: "PRJ-DEMO-001",
        amount: 1000,
      }).success
    ).toBe(false);
  });

  it("parses an empty template portfolio", () => {
    const parsed = pmoPortfolioFileSchema.parse({ as_of: "2026-08-24", projects: [] });
    expect(parsed.projects).toEqual([]);
  });
});

describe("pmo optional tenant", () => {
  it("skips tenants with README-only data/projects", () => {
    setTenantId("acme");
    expect(collectPmoSchemaErrors()).toEqual([]);
    expect(loadPmoPortfolio().present).toBe(false);
  });
});

describe("pmo mal fixture", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads five indexed projects", () => {
    const loaded = loadPmoPortfolio();
    expect(loaded.present).toBe(true);
    expect(loaded.unexpectedFiles).toEqual([]);
    expect(loaded.portfolio?.projects).toHaveLength(5);
    expect(loaded.projects.map((p) => p.id).sort()).toEqual(
      [
        "PRJ-ANTIQUE-PERMIT",
        "PRJ-BANCHO-HQ",
        "PRJ-CORP-REG",
        "PRJ-KAMEZAWA-OPS",
        "PRJ-MED-QMS",
      ]
    );
    expect(collectPmoSchemaErrors()).toEqual([]);
  });

  it("does not emit integrity errors against live CTR/PROP/module refs", () => {
    const loaded = loadPmoPortfolio();
    const issues = collectPmoIntegrityIssues({
      propertyIds: new Set(["PROP-001", "PROP-002"]),
      contractIds: new Set(["CTR-013", "CTR-014"]),
    });
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    expect(loaded.projects.some((p) => p.links.module_refs.some((r) => r.ref === "APP-ANTIQUE-DEALER-001"))).toBe(
      true
    );
  });
});

describe("pmo cli views", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("aggregates mal portfolio without personal names", () => {
    const view = buildPmoPortfolioView({ asOf: AS_OF });
    expect(view.coverage).toBe("registered");
    expect(view.total).toBe(5);
    expect(view.by_rag.amber).toBeGreaterThan(0);
    expect(view.overdue_milestones).toBeGreaterThanOrEqual(1);
    const md = formatPmoPortfolioMarkdown(view);
    expect(md).toContain("PRJ-CORP-REG");
    expect(md).not.toMatch(/段燕燕|宮城|三塚/);
    expect(formatPmoCeoReply(view)).toMatch(/5件/);
  });

  it("lists overdue milestones as of 2026-08-24", () => {
    const view = buildPmoMilestonesView({ asOf: AS_OF, days: 14 });
    expect(view.overdue.some((m) => m.project_id === "PRJ-CORP-REG")).toBe(true);
    expect(view.overdue.every((m) => m.due < AS_OF)).toBe(true);
  });

  it("lists open risks and shows one project", () => {
    const risks = buildPmoRisksView({ asOf: AS_OF });
    expect(risks.open.length).toBeGreaterThan(0);
    const shown = buildPmoShowView("PRJ-BANCHO-HQ", { asOf: AS_OF });
    expect(shown.found).toBe(true);
    expect(shown.project?.links.property_ids).toContain("PROP-001");
  });

  it("marks acme as unregistered", () => {
    setTenantId("acme");
    const view = buildPmoPortfolioView({ asOf: AS_OF });
    expect(view.coverage).toBe("unregistered");
    expect(formatPmoCeoReply(view)).toBe("未登録");
  });
});

describe("pmo skill dispatch", () => {
  it("wires cli skills to in-process handlers", () => {
    clearSkillRegistryCache();
    expect(resolveRegisteredSkillInvocation("pmo_portfolio").status).toBe("ready");
    expect(resolveRegisteredSkillInvocation("pmo-milestones").status).toBe("ready");
    expect(resolveRegisteredSkillInvocation("pmo_risks").status).toBe("ready");
    expect(resolveRegisteredSkillInvocation("pmo_show", { id: "PRJ-BANCHO-HQ" }).status).toBe(
      "ready"
    );
    expect(resolveRegisteredSkillInvocation("pm_status_review").status).toBe("agent");
  });
});

describe("pmo fact provider", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches portfolio intents and answers for mal", () => {
    expect(listFactProviders().some((p) => p.id === "pmo_portfolio")).toBe(true);
    expect(matchProviderByIntent("案件状況は？")?.id).toBe("pmo_portfolio");
    expect(matchProviderByIntent("従業員数は何人？")?.id).not.toBe("pmo_portfolio");
    const result = handleFactChatMessage("案件状況は？");
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/5件/);
    expect(result.work_order_ids).toBeUndefined();
  });
});
