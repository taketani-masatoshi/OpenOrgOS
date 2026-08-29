import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
} from "../src/lib/company-events.js";
import { runWeeklyCompanyEventsAttestation } from "../src/lib/company-events-attestation.js";
import { exportCompanyEventsAuditBundle } from "../src/lib/company-events-export.js";
import { migrateCompanyEventsChain } from "../src/lib/company-events-migrate.js";
import { getDataDir } from "../src/lib/utils.js";
import { setTenantId } from "../src/lib/tenant.js";

function cleanup(): void {
  for (const name of [
    "company-events.yaml",
    "company-events-chain.jsonl",
    "company-events-attestations.jsonl",
    "company-events-signing-meta.yaml",
  ]) {
    const p = join(getDataDir(), name);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  const orgosDir = join(getDataDir(), ".orgos");
  if (existsSync(orgosDir)) rmSync(orgosDir, { recursive: true, force: true });
}

describe("company-events export bundle", () => {
  let outDir: string;

  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    outDir = mkdtempSync(join(tmpdir(), "orgos-export-"));
    initCompanyEventsFile();
    ensureCompanyEventMonth("2026-07");
    createCompanyEvent({
      kind: "misc",
      title: "Export test",
      occurredAt: "2026-07-08",
      slug: "export-test",
      notes: "secret-note-should-not-export-plain",
    });
    runWeeklyCompanyEventsAttestation({ force: true });
    migrateCompanyEventsChain();
  });

  afterEach(() => {
    cleanup();
    rmSync(outDir, { recursive: true, force: true });
  });

  it("exports bundle verifiable by verify-bundle.mjs", () => {
    exportCompanyEventsAuditBundle(outDir);
    expect(existsSync(join(outDir, "verify-bundle.mjs"))).toBe(true);
    const registry = JSON.parse(readFileSync(join(outDir, "registry-audit.json"), "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    expect(registry.events[0]?.notes).toBeUndefined();
    expect(registry.events[0]?.notes_digest).toBeTruthy();
    expect(JSON.stringify(registry)).not.toContain("secret-note-should-not-export-plain");

    const output = execFileSync("node", [join(outDir, "verify-bundle.mjs")], {
      encoding: "utf8",
    });
    expect(output).toContain("PASS");
  });
});

describe("company-events migrate", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    initCompanyEventsFile();
    ensureCompanyEventMonth("2026-07");
    createCompanyEvent({
      kind: "misc",
      title: "Migrate test",
      occurredAt: "2026-07-08",
      slug: "migrate-test",
    });
  });

  afterEach(() => cleanup());

  it("migrates signing meta to v2 and normalizes registry idempotently", () => {
    const first = migrateCompanyEventsChain();
    expect(first.signing_meta_migrated).toBe(true);
    expect(first.verify_ok).toBe(true);

    const second = migrateCompanyEventsChain();
    expect(second.registry_migrated).toBe(false);
    expect(second.signing_meta_migrated).toBe(false);
    expect(second.verify_ok).toBe(true);
  });

  it("dry-run preview leaves migrate work for subsequent run when meta only", () => {
    migrateCompanyEventsChain();
    const preview = migrateCompanyEventsChain({ dryRun: true });
    expect(preview.dry_run).toBe(true);
    expect(preview.verify_ok).toBe(true);
    const again = migrateCompanyEventsChain();
    expect(again.registry_migrated).toBe(false);
  });
});
