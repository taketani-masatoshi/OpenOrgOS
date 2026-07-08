import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTenantId } from "../src/lib/tenant.js";
import {
  archiveCompanyEvent,
  closeCompanyEvent,
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
  loadCompanyEvents,
  validateCompanyEvents,
} from "../src/lib/company-events.js";
import { getDataDir, resolveTenantPath } from "../src/lib/utils.js";

const REGISTRY_PATH = () => join(getDataDir(), "company-events.yaml");
const REGISTRY_BACKUP = join(tmpdir(), "steward-company-events-lifecycle-backup.yaml");

describe("company-events lifecycle", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    initCompanyEventsFile();
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

  it("closes and archives event with MD + registry sync", () => {
    ensureCompanyEventMonth("2099-06");
    const event = createCompanyEvent({
      kind: "registration",
      title: "Lifecycle test",
      occurredAt: "2099-06-10",
      slug: "lifecycle-test",
    });
    created.push(event.event_path, event.artifact_dir);

    const closed = closeCompanyEvent(event.id);
    expect(closed.status).toBe("closed");
    expect(closed.closed_at).toBeTruthy();

    const mdClosed = readFileSync(resolveTenantPath(event.event_path), "utf8");
    expect(mdClosed).toContain("status: closed");

    const archived = archiveCompanyEvent(event.id);
    expect(archived.status).toBe("archived");
    expect(loadCompanyEvents().events.find((e) => e.id === event.id)?.status).toBe("archived");
  });

  it("rejects invalid status transition", () => {
    ensureCompanyEventMonth("2099-07");
    const event = createCompanyEvent({
      kind: "misc",
      title: "Transition test",
      occurredAt: "2099-07-01",
      slug: "transition-test",
    });
    created.push(event.event_path, event.artifact_dir);
    archiveCompanyEvent(event.id);
    expect(() => closeCompanyEvent(event.id)).toThrow(/Cannot transition/);
  });

  it("validate detects missing event MD", () => {
    ensureCompanyEventMonth("2099-08");
    const event = createCompanyEvent({
      kind: "contract",
      title: "Validate test",
      occurredAt: "2099-08-01",
      slug: "validate-test",
    });
    created.push(event.artifact_dir);
    rmSync(resolveTenantPath(event.event_path));

    const result = validateCompanyEvents();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "event-md-missing" && i.event_id === event.id)).toBe(
      true
    );
  });
});
