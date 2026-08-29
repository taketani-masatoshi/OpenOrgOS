import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { companyEventsRegistrySchema } from "../schemas/company-events.js";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  loadCompanyEvents,
  saveCompanyEvents,
} from "../src/lib/company-events.js";
import {
  loadCompanyEventChain,
  repairCompanyEventChainFromRegistry,
  validateCompanyEventChainWithRegistry,
} from "../src/lib/company-events-chain.js";
import {
  runEventsStatus,
  runEventsWireStatus,
} from "../src/commands/company-events.js";
import { getDataDir } from "../src/lib/utils.js";
import { setupTempCompanyEventsTenant } from "./helpers/temp-company-events-tenant.js";

describe("company events repair and legacy registry", () => {
  const env = { ...process.env };
  let restore: () => void;

  beforeEach(() => {
    restore = setupTempCompanyEventsTenant().restore;
    process.env.STEWARD_EVENTS_WRITE_GUARD = "off";
  });

  afterEach(() => {
    process.env = { ...env };
    restore();
  });

  it("parses legacy version:1 + as_of registry as schema v3", () => {
    const path = join(getDataDir(), "company-events.yaml");
    writeFileSync(
      path,
      `version: "1"
as_of: "2026-07-10"
events: []
`,
      "utf8"
    );
    const parsed = companyEventsRegistrySchema.parse(
      JSON.parse(
        JSON.stringify({
          version: "1",
          as_of: "2026-07-10",
          events: [],
        })
      )
    );
    expect(parsed.schema_version).toBe(3);
    expect(loadCompanyEvents().schema_version).toBe(3);
  });

  it("repair rebuilds chain from registry and clears duplicate test links", () => {
    ensureCompanyEventMonth("2099-01");
    createCompanyEvent({
      kind: "misc",
      title: "Real event A",
      occurredAt: "2099-01-01",
      slug: "real-a",
    });
    createCompanyEvent({
      kind: "misc",
      title: "Real event B",
      occurredAt: "2099-01-02",
      slug: "real-b",
    });

    const chainPath = join(getDataDir(), "company-events-chain.jsonl");
    const polluted = readFileSync(chainPath, "utf8");
    writeFileSync(chainPath, polluted + polluted, "utf8");

    expect(loadCompanyEventChain().length).toBeGreaterThan(2);

    const registry = loadCompanyEvents();
    const result = repairCompanyEventChainFromRegistry(registry, { iUnderstandRepair: true });
    saveCompanyEvents(result.registry);

    expect(result.links).toBe(2);
    expect(result.backup_path).toBeDefined();
    const verify = validateCompanyEventChainWithRegistry(loadCompanyEvents());
    expect(verify.ok).toBe(true);
  });

  it("runEventsStatus prints registry summary (N-09)", () => {
    ensureCompanyEventMonth("2099-02");
    createCompanyEvent({
      kind: "governance",
      title: "Status CLI smoke",
      occurredAt: "2099-02-01",
      slug: "status-smoke",
    });

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(String(msg));
    });
    runEventsStatus();
    spy.mockRestore();

    expect(logs.some((l) => l.includes("Company events registry:"))).toBe(true);
    expect(logs.some((l) => l.includes("company-events.yaml"))).toBe(true);
  });

  it("runEventsWireStatus prints void_blocked for event without wire (FR-28)", () => {
    ensureCompanyEventMonth("2099-03");
    const event = createCompanyEvent({
      kind: "contract",
      title: "Wire status smoke",
      occurredAt: "2099-03-01",
      slug: "wire-status-smoke",
    });

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(String(msg));
    });
    runEventsWireStatus({ id: event.id });
    spy.mockRestore();

    expect(logs.some((l) => l.includes("void_blocked: false"))).toBe(true);
    expect(logs.some((l) => l.includes(event.id))).toBe(true);
  });
});
