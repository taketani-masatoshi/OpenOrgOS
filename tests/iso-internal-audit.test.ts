import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { resetRuntimeContext, setRuntimeContext } from "../src/lib/runtime-context.js";
import {
  listAvailableIsoIds,
  listIsoCatalogEntries,
  verifyIsoMaps,
} from "../src/lib/iso-catalog.js";
import {
  evaluateIsoInternalAudit,
  formatIsoInternalAuditReport,
  loadIsoInternalAuditRuns,
  persistIsoInternalAuditRun,
} from "../src/lib/iso-internal-audit.js";
import { loadEnabledIsoIds } from "../src/lib/tenant-standards.js";

describe("ISO catalog maps", () => {
  it("every available standard has a loadable map", () => {
    const entries = listIsoCatalogEntries();
    expect(entries.map((e) => e.id)).toContain("ISO-9001");
    expect(entries.map((e) => e.id)).toContain("ISO-37000");
    expect(listAvailableIsoIds()).toHaveLength(12);
    const { ok, statuses } = verifyIsoMaps();
    expect(ok, statuses.filter((s) => s.error).map((s) => `${s.id}: ${s.error}`).join("; ")).toBe(
      true
    );
    expect(statuses.filter((s) => !s.skipped).every((s) => s.control_count > 0)).toBe(true);
  });

  it("coming_soon entries are skipped rather than failed", () => {
    const { statuses } = verifyIsoMaps();
    const soon = statuses.filter((s) => s.status === "coming_soon");
    expect(soon.length).toBeGreaterThan(0);
    expect(soon.every((s) => s.skipped && !s.error)).toBe(true);
  });
});

describe("ISO internal audit loop", () => {
  const logPath = join(tmpdir(), `orgos-iso-audit-test-${process.pid}.jsonl`);

  beforeEach(() => {
    setTenantId("mal");
    process.env.ORGOS_ISO_AUDIT_LOG = logPath;
    if (existsSync(logPath)) unlinkSync(logPath);
    let seq = 0;
    setRuntimeContext({
      clock: {
        now: () => new Date("2026-08-29T02:00:00.000Z"),
        nowMs: () => Date.parse("2026-08-29T02:00:00.000Z"),
        nowIso: () => "2026-08-29T02:00:00.000Z",
      },
      idGenerator: {
        randomSuffix: () => "test",
        uniqueId: (prefix) => `${prefix}-test-${++seq}`,
        uuid: () => "00000000-0000-4000-8000-000000000001",
      },
    });
  });

  afterEach(() => {
    resetRuntimeContext();
    delete process.env.ORGOS_ISO_AUDIT_LOG;
    if (existsSync(logPath)) unlinkSync(logPath);
  });

  it("evaluates enabled ISO controls without writing", () => {
    const run = evaluateIsoInternalAudit();
    expect(run.actor).toBe("internal_audit");
    // Audits exactly what the tenant enabled — not a fixed list, since the set
    // of certification targets is the tenant's decision.
    expect(run.standards).toEqual(loadEnabledIsoIds());
    expect(run.standards.length).toBeGreaterThan(0);
    expect(run.findings.length).toBeGreaterThan(0);
    expect(run.summary.total).toBe(run.findings.length);
    expect(existsSync(logPath)).toBe(false);
  });

  it("appends two runs and report covers management sections", () => {
    const first = evaluateIsoInternalAudit();
    persistIsoInternalAuditRun(first, { writeReports: false });
    const second = evaluateIsoInternalAudit();
    persistIsoInternalAuditRun(second, { writeReports: false });
    const loaded = loadIsoInternalAuditRuns();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.id).toBe(first.id);
    expect(loaded[1]?.id).toBe(second.id);

    const md = formatIsoInternalAuditReport(second, first);
    expect(md).toContain("## 現状");
    expect(md).toContain("## 問題点");
    expect(md).toContain("## 課題");
    expect(md).toContain("## 適合状況（規格別）");
    expect(md).toContain("## 改善提案");
    expect(md).toContain(second.id);
  });

  it("disabled standard is reported as map_missing", () => {
    const run = evaluateIsoInternalAudit({ iso: "ISO-14001" });
    expect(run.standards).toEqual([]);
    expect(run.findings.some((f) => f.verdict === "map_missing" && f.standard === "ISO-14001")).toBe(
      true
    );
  });
});
