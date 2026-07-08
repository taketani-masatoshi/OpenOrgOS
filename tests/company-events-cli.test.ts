import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTenantId } from "../src/lib/tenant.js";
import {
  closeCompanyEvent,
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
} from "../src/lib/company-events.js";
import {
  runEventsClose,
  runEventsRegisterArtifact,
  runEventsValidate,
} from "../src/commands/company-events.js";
import { getDataDir, resolveTenantPath } from "../src/lib/utils.js";

const REGISTRY_PATH = () => join(getDataDir(), "company-events.yaml");
const REGISTRY_BACKUP = join(tmpdir(), "steward-company-events-cli-backup.yaml");

describe("company events CLI smoke", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    initCompanyEventsFile();
    if (existsSync(REGISTRY_PATH())) {
      copyFileSync(REGISTRY_PATH(), REGISTRY_BACKUP);
    }
    writeFileSync(REGISTRY_PATH(), "schema_version: 1\nevents: []\n", "utf8");
    created.length = 0;
  });

  afterEach(() => {
    for (const rel of created) {
      const abs = resolveTenantPath(rel);
      if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
    }
    if (existsSync(REGISTRY_BACKUP)) {
      copyFileSync(REGISTRY_BACKUP, REGISTRY_PATH());
      unlinkSync(REGISTRY_BACKUP);
    }
  });

  it("runEventsClose logs success", () => {
    ensureCompanyEventMonth("2099-08");
    const event = createCompanyEvent({
      kind: "misc",
      title: "CLI close smoke",
      occurredAt: "2099-08-05",
      slug: "cli-close-smoke",
    });
    created.push(event.event_path, event.artifact_dir);

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
    created.push(event.event_path, event.artifact_dir);

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
    created.push(event.event_path, event.artifact_dir);

    closeCompanyEvent(event.id);
    const indexAbs = resolveTenantPath("docs/company/events/2099-10/_INDEX.md");
    const index = readFileSync(indexAbs, "utf8");
    expect(index).toContain(event.id);
    expect(index).toContain("| closed |");
  });
});
