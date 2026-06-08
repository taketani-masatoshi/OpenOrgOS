import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { DOCS_DIR } from "../src/lib/utils.js";
import {
  loadRoutingRegistry,
  matchRoutes,
  pickBestRoute,
  checkExecutiveBoundary,
  isExecutiveDataPath,
  pathMatchesPattern,
  checkRouteAccess,
  buildHandoff,
  writeHandoffFiles,
  loadHandoff,
  validateRoutingRegistry,
  formatSuggestCard,
} from "../src/lib/routing.js";

describe("routing registry", () => {
  it("loads registry with example routes", () => {
    const registry = loadRoutingRegistry();
    expect(registry.routes.length).toBeGreaterThanOrEqual(10);
    expect(registry.routes.some((r) => r.id === "contract-expiry")).toBe(true);
    expect(registry.routes.some((r) => r.id === "secretary-schedule")).toBe(true);
    expect(registry.routes.some((r) => r.id === "executive-kpi")).toBe(true);
    expect(validateRoutingRegistry()).toEqual([]);
  });
});

describe("path matching", () => {
  it("matches glob-like path patterns", () => {
    expect(pathMatchesPattern("data/contracts/CTR-001.yaml", "data/contracts/")).toBe(true);
    expect(pathMatchesPattern("docs/io/inbox/scan.pdf", "docs/io/inbox/")).toBe(true);
    expect(isExecutiveDataPath("data/executive/calendar.yaml")).toBe(true);
    expect(isExecutiveDataPath("data/finance/cash-balance.yaml")).toBe(false);
  });
});

describe("route matching", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches contract expiry by keyword", () => {
    const matches = matchRoutes({ text: "契約期限を確認したい" });
    expect(matches[0]?.route.id).toBe("contract-expiry");
    expect(matches[0]?.access.allowed).toBe(true);
  });

  it("routes executive calendar path to secretary", () => {
    const best = pickBestRoute({ path: "data/executive/calendar.yaml" });
    expect(best?.route.agent).toBe("secretary");
    expect(best?.route.id).toBe("secretary-schedule");
    expect(best?.boundaryOk).toBe(true);
  });

  it("blocks executive_steward on executive data management", () => {
    const route = loadRoutingRegistry().routes.find((r) => r.id === "executive-kpi")!;
    expect(checkExecutiveBoundary(route, "data/executive/calendar.yaml")).toBe(false);
  });

  it("allows executive_kpi route for dashboard summaries", () => {
    const best = pickBestRoute({ text: "KPI とランウェイを教えて" });
    expect(best?.route.agent).toBe("executive_steward");
    expect(best?.route.id).toBe("executive-kpi");
  });

  it("respects module enablement for rental agent", () => {
    setTenantId("demo");
    const matches = matchRoutes({ text: "賃貸の入居者" });
    const rental = matches.find((m) => m.route.id === "rental-operations");
    expect(rental?.moduleEnabled).toBe(true);
    expect(rental?.access.allowed).toBe(true);
  });

  it("denies access when agent lacks resource permission", () => {
    const result = checkRouteAccess("contract", ["data/operations/kamezawa-secrets.yaml"]);
    expect(result.allowed).toBe(false);
  });
});

describe("handoff", () => {
  const queueDir = join(DOCS_DIR, "reports", "routing-queue");
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
  });

  afterEach(() => {
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const p = join(queueDir, `${id}${ext}`);
        if (existsSync(p)) rmSync(p);
      }
    }
  });

  it("writes and loads handoff files", () => {
    const matched = pickBestRoute({ text: "月次締め" });
    const handoff = buildHandoff({ text: "月次締め", fromAgent: "secretary" }, matched);
    created.push(handoff.id);

    const { yamlPath, mdPath } = writeHandoffFiles(handoff, matched);
    expect(existsSync(yamlPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);

    const loaded = loadHandoff(handoff.id);
    expect(loaded.to_agent).toBe("finance");
    expect(loaded.skill).toBe("monthly_close");
    expect(formatSuggestCard(loaded)).toContain("finance");
  });
});
