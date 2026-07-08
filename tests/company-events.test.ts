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
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
  listCompanyEvents,
  loadCompanyEvents,
} from "../src/lib/company-events.js";
import { companyEventsRegistrySchema } from "../schemas/company-events.js";
import { getDataDir, resolveTenantPath } from "../src/lib/utils.js";

const REGISTRY_PATH = () => join(getDataDir(), "company-events.yaml");
const CHAIN_PATH = () => join(getDataDir(), "company-events-chain.jsonl");
const REGISTRY_BACKUP = join(tmpdir(), "steward-company-events-backup.yaml");
const CHAIN_BACKUP = join(tmpdir(), "steward-company-events-chain-backup.jsonl");

describe("company-events", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    initCompanyEventsFile();
    if (existsSync(REGISTRY_PATH())) {
      copyFileSync(REGISTRY_PATH(), REGISTRY_BACKUP);
    }
    if (existsSync(CHAIN_PATH())) {
      copyFileSync(CHAIN_PATH(), CHAIN_BACKUP);
    } else if (existsSync(CHAIN_BACKUP)) {
      unlinkSync(CHAIN_BACKUP);
    }
    writeFileSync(REGISTRY_PATH(), "schema_version: 2\nevents: []\n", "utf8");
    if (existsSync(CHAIN_PATH())) {
      unlinkSync(CHAIN_PATH());
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
    if (existsSync(CHAIN_BACKUP)) {
      copyFileSync(CHAIN_BACKUP, CHAIN_PATH());
      unlinkSync(CHAIN_BACKUP);
    } else if (existsSync(CHAIN_PATH())) {
      unlinkSync(CHAIN_PATH());
    }
  });

  it("validates empty registry", () => {
    const data = loadCompanyEvents();
    expect(companyEventsRegistrySchema.parse(data)).toEqual(data);
    expect(data.events).toEqual([]);
  });

  it("ensure-month creates events and artifacts folders", () => {
    const month = "2099-01";
    const result = ensureCompanyEventMonth(month);
    created.push(result.eventsDirRel, result.artifactsDirRel);
    expect(existsSync(result.eventsDir)).toBe(true);
    expect(existsSync(result.artifactsDir)).toBe(true);
    expect(existsSync(join(result.eventsDir, "_INDEX.md"))).toBe(true);
  });

  it("creates event record separated from artifacts", () => {
    ensureCompanyEventMonth("2099-02");
    const event = createCompanyEvent({
      kind: "registration",
      title: "Test incorporation filing",
      occurredAt: "2099-02-15",
      slug: "test-incorp",
      related: { registration_case_id: "INC-2099-001" },
    });
    created.push(event.event_path, event.artifact_dir);

    expect(event.id).toBe("EVT-20990215-registration-test-incorp");
    expect(existsSync(resolveTenantPath(event.event_path))).toBe(true);
    expect(existsSync(resolveTenantPath(`${event.artifact_dir}00-artifact-index.md`))).toBe(true);
    expect(existsSync(resolveTenantPath(`${event.artifact_dir}records/`))).toBe(true);

    const eventMd = readFileSync(resolveTenantPath(event.event_path), "utf8");
    expect(eventMd).toContain("artifact_dir:");
    expect(eventMd).toContain(event.artifact_dir);
    expect(eventMd).not.toContain("定款");

    expect(loadCompanyEvents().events.some((e) => e.id === event.id)).toBe(true);
    expect(listCompanyEvents({ month: "2099-02" })).toHaveLength(1);
  });

  it("auto slug falls back to kind for Japanese-only title", () => {
    ensureCompanyEventMonth("2099-03");
    const event = createCompanyEvent({
      kind: "governance",
      title: "取締役会",
      occurredAt: "2099-03-01",
    });
    created.push(event.event_path, event.artifact_dir);
    expect(event.id).toMatch(/^EVT-20990301-governance-governance/);
  });
});
