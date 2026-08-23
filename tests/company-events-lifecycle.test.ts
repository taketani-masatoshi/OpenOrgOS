import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  archiveCompanyEvent,
  closeCompanyEvent,
  createCompanyEvent,
  ensureCompanyEventMonth,
  loadCompanyEvents,
  validateCompanyEvents,
} from "../src/lib/company-events.js";
import { resolveTenantPath } from "../src/lib/utils.js";
import { setupTempCompanyEventsTenant } from "./helpers/temp-company-events-tenant.js";

describe("company-events lifecycle", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupTempCompanyEventsTenant().restore;
  });

  afterEach(() => {
    restore();
  });

  it("closes and archives event with MD + registry sync", () => {
    ensureCompanyEventMonth("2099-06");
    const event = createCompanyEvent({
      kind: "registration",
      title: "Lifecycle test",
      occurredAt: "2099-06-10",
      slug: "lifecycle-test",
    });

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
    rmSync(resolveTenantPath(event.event_path));

    const result = validateCompanyEvents();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "event-md-missing" && i.event_id === event.id)).toBe(
      true,
    );
    expect(existsSync(resolveTenantPath(event.artifact_dir))).toBe(true);
  });
});
