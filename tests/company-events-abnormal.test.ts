import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir, resolveTenantPath, writeYamlFile } from "../src/lib/utils.js";
import {
  buildEventId,
  archiveCompanyEvent,
  closeCompanyEvent,
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
  listCompanyEvents,
  loadCompanyEvents,
  parseMonth,
  validateCompanyEvents,
} from "../src/lib/company-events.js";
import { runEventsNew } from "../src/commands/company-events.js";

const REGISTRY_PATH = () => join(getDataDir(), "company-events.yaml");
const REGISTRY_BACKUP = join(tmpdir(), "steward-company-events-abnormal-backup.yaml");

describe("company-events abnormal", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    initCompanyEventsFile();
    // Drop leftover 2099-* abnormal fixtures from prior interrupted runs.
    const registry = loadCompanyEvents();
    const filtered = registry.events.filter((e) => !/-2099/.test(e.id) && !e.id.includes("2099"));
    if (filtered.length !== registry.events.length) {
      writeYamlFile(REGISTRY_PATH(), { ...registry, events: filtered });
    }
    if (existsSync(REGISTRY_PATH())) {
      copyFileSync(REGISTRY_PATH(), REGISTRY_BACKUP);
    }
    created.length = 0;
  });

  afterEach(() => {
    for (const rel of created) {
      const abs = resolveTenantPath(rel);
      if (existsSync(abs)) {
        rmSync(abs, { recursive: true, force: true });
      }
    }
    if (existsSync(REGISTRY_BACKUP)) {
      copyFileSync(REGISTRY_BACKUP, REGISTRY_PATH());
      unlinkSync(REGISTRY_BACKUP);
    }
  });

  it("E-01: rejects invalid YYYY-MM in parseMonth", () => {
    expect(() => parseMonth("2026-13")).toThrow(/Invalid month/);
    expect(() => parseMonth("26-06")).toThrow(/Invalid month/);
  });

  it("E-02: rejects invalid kind in runEventsNew", () => {
    expect(() =>
      runEventsNew({ kind: "invalid-kind", title: "Test" })
    ).toThrow(/Invalid kind/);
  });

  it("E-03: rejects invalid slug in buildEventId", () => {
    expect(() => buildEventId("2099-04-01", "misc", "ab")).toThrow(/Invalid slug/);
    expect(() => buildEventId("2099-04-01", "misc", "bad slug!")).toThrow(/Invalid slug/);
  });

  it("E-04: rejects duplicate event id on second create", () => {
    ensureCompanyEventMonth("2099-04");
    const first = createCompanyEvent({
      kind: "contract",
      title: "Duplicate test",
      occurredAt: "2099-04-10",
      slug: "dup-test",
    });
    created.push(first.event_path, first.artifact_dir);
    expect(() =>
      createCompanyEvent({
        kind: "contract",
        title: "Duplicate test again",
        occurredAt: "2099-04-10",
        slug: "dup-test",
      })
    ).toThrow(/Event already exists/);
  });

  it("E-05: rejects corrupted company-events.yaml", () => {
    writeFileSync(REGISTRY_PATH(), "schema_version: 1\nevents:\n  - id: NOT-EVT\n", "utf-8");
    expect(() => loadCompanyEvents()).toThrow();
  });

  it("E-06: list returns empty for month with no events", () => {
    ensureCompanyEventMonth("2099-05");
    expect(listCompanyEvents({ month: "2099-05" })).toEqual([]);
    expect(listCompanyEvents({ month: "1999-01" })).toEqual([]);
  });

  it("E-07: rejects archived → closed transition", () => {
    ensureCompanyEventMonth("2099-09");
    const event = createCompanyEvent({
      kind: "misc",
      title: "Archive transition",
      occurredAt: "2099-09-01",
      slug: "archive-transition",
    });
    created.push(event.event_path, event.artifact_dir);
    archiveCompanyEvent(event.id);
    expect(() => closeCompanyEvent(event.id)).toThrow(/Cannot transition archived → closed/);
  });

  it("E-08: validateCompanyEvents flags missing artifact index", () => {
    ensureCompanyEventMonth("2099-10");
    const event = createCompanyEvent({
      kind: "governance",
      title: "Missing index",
      occurredAt: "2099-10-01",
      slug: "missing-index",
    });
    created.push(event.event_path);
    rmSync(resolveTenantPath(`${event.artifact_dir}00-artifact-index.md`));

    const result = validateCompanyEvents();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "artifact-index-missing")).toBe(true);
  });
});
