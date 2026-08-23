import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  closeCompanyEvent,
  createCompanyEvent,
  ensureCompanyEventMonth,
} from "../src/lib/company-events.js";
import {
  runEventsArchive,
  runEventsChainBackfill,
  runEventsClose,
  runEventsNew,
  runEventsRegisterArtifact,
  runEventsValidate,
} from "../src/commands/company-events.js";
import { getDataDir, resolveTenantPath } from "../src/lib/utils.js";
import { roleDefaultPermissions } from "../src/lib/org/operator-effective.js";
import {
  HA_CEO_ID,
  HA_CEO_KEY,
  HA_RO_ID,
  HA_RO_KEY,
  setupTempCompanyEventsTenant,
} from "./helpers/temp-company-events-tenant.js";

const CHAIN_PATH = () => join(getDataDir(), "company-events-chain.jsonl");

describe("company events CLI smoke", () => {
  const env = { ...process.env };
  let restore: () => void;

  beforeEach(() => {
    restore = setupTempCompanyEventsTenant().restore;
  });

  afterEach(() => {
    process.env = { ...env };
    restore();
  });

  it("runEventsClose logs success", () => {
    ensureCompanyEventMonth("2099-08");
    const event = createCompanyEvent({
      kind: "misc",
      title: "CLI close smoke",
      occurredAt: "2099-08-05",
      slug: "cli-close-smoke",
    });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runEventsClose({ id: event.id });
    expect(spy).toHaveBeenCalledWith(`✓ Company event closed: ${event.id}`);
    spy.mockRestore();
  });

  it("runEventsValidate logs OK on healthy registry", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    runEventsValidate({});
    expect(spy).toHaveBeenCalledWith("✓ Company events OK");
    expect(exitSpy).not.toHaveBeenCalled();
    spy.mockRestore();
    exitSpy.mockRestore();
  });

  it("runEventsRegisterArtifact logs success", () => {
    ensureCompanyEventMonth("2099-09");
    const event = createCompanyEvent({
      kind: "registration",
      title: "CLI artifact smoke",
      occurredAt: "2099-09-01",
      slug: "cli-artifact-smoke",
    });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runEventsRegisterArtifact({ id: event.id, files: "draft-teikan.md", kind: "generated-md" });
    expect(spy).toHaveBeenCalledWith(`✓ Artifact index updated: ${event.id}`);
    spy.mockRestore();
  });

  it("close updates _INDEX status column", () => {
    ensureCompanyEventMonth("2099-10");
    const event = createCompanyEvent({
      kind: "governance",
      title: "Index refresh smoke",
      occurredAt: "2099-10-15",
      slug: "index-refresh-smoke",
    });

    closeCompanyEvent(event.id);
    const indexAbs = resolveTenantPath("docs/company/events/2099-10/_INDEX.md");
    const index = readFileSync(indexAbs, "utf8");
    expect(index).toContain(event.id);
    expect(index).toContain("| closed |");
  });

  it("rejects unauthenticated events new/close/archive when operator auth is required", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    delete process.env.ORGOS_CLI_OPERATOR_ID;
    delete process.env.ORGOS_OPERATOR_KEY;
    expect(() => runEventsNew({ kind: "misc", title: "No auth" })).toThrow(/--operator-id/);
    expect(() => runEventsClose({ id: "EVT-none" })).toThrow(/--operator-id/);
    expect(() => runEventsArchive({ id: "EVT-none" })).toThrow(/--operator-id/);
  });

  it("rejects events:write for readonly operators", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    process.env.ORGOS_CLI_OPERATOR_ID = HA_RO_ID;
    process.env.ORGOS_OPERATOR_KEY = HA_RO_KEY;
    expect(roleDefaultPermissions("readonly")).not.toContain("events:write");
    expect(roleDefaultPermissions("mcp_service")).not.toContain("events:write");
    expect(roleDefaultPermissions("ceo")).toContain("events:write");
    expect(roleDefaultPermissions("operator")).toContain("events:write");
    expect(() => runEventsNew({ kind: "misc", title: "Readonly blocked" })).toThrow(
      /lacks permission events:write/,
    );
  });

  it("allows ceo with events:write to create an event", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    process.env.ORGOS_CLI_OPERATOR_ID = HA_CEO_ID;
    process.env.ORGOS_OPERATOR_KEY = HA_CEO_KEY;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runEventsNew({
      kind: "misc",
      title: "CEO create",
      date: "2099-11-01",
      slug: "ceo-create",
    });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("Company event created"))).toBe(true);
    spy.mockRestore();
  });

  it("refuses backfill --force without rebuild env or confirm flag", () => {
    ensureCompanyEventMonth("2099-12");
    createCompanyEvent({
      kind: "misc",
      title: "Force cli",
      occurredAt: "2099-12-01",
      slug: "force-cli",
    });
    const before = existsSync(CHAIN_PATH()) ? readFileSync(CHAIN_PATH(), "utf8") : "";
    delete process.env.ORGOS_EVENTS_CHAIN_REBUILD;
    process.env.STEWARD_OPERATOR_AUTH = "1";
    process.env.ORGOS_CLI_OPERATOR_ID = HA_CEO_ID;
    process.env.ORGOS_OPERATOR_KEY = HA_CEO_KEY;
    expect(() => runEventsChainBackfill({ force: true })).toThrow(/i-understand-rebuild/);
    expect(readFileSync(CHAIN_PATH(), "utf8")).toBe(before);

    expect(() =>
      runEventsChainBackfill({ force: true, iUnderstandRebuild: true }),
    ).toThrow(/ORGOS_EVENTS_CHAIN_REBUILD/);
    expect(readFileSync(CHAIN_PATH(), "utf8")).toBe(before);
  });
});
