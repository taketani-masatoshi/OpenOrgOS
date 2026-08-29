import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  adoptCompanyEventFromMarkdown,
  ensureCompanyEventMonth,
  getDocsCompanyEventsDir,
  initCompanyEventsFile,
  listOrphanEventMarkdown,
  loadCompanyEvents,
  pruneOrphanEventMarkdown,
  validateCompanyEvents,
} from "../src/lib/company-events.js";
import { loadCompanyEventChain } from "../src/lib/company-events-chain.js";
import {
  HA_CEO_ID,
  HA_CEO_KEY,
  setupTempCompanyEventsTenant,
} from "./helpers/temp-company-events-tenant.js";

const ORPHAN_ID = "EVT-20990101-finance-adopt-smoke";
const ORPHAN_MONTH = "2099-01";

function writeOrphanMarkdown(id: string, month: string): string {
  ensureCompanyEventMonth(month);
  const abs = join(getDocsCompanyEventsDir(), month, `${id}.md`);
  const artifactDir = `docs/company/artifacts/${month}/${id}/`;
  mkdirSync(join(getDocsCompanyEventsDir(), month), { recursive: true });
  writeFileSync(
    abs,
    [
      "---",
      `event_id: ${id}`,
      "occurred_at: 2099-01-01",
      "kind: finance",
      "status: open",
      `artifact_dir: ${artifactDir}`,
      "---",
      "",
      `# Adopt smoke ${id}`,
      "",
    ].join("\n"),
    "utf8",
  );
  return `tenants/ha-iso/docs/company/events/${month}/${id}.md`;
}

function gitTrack(workspace: string, repoRelativePath: string): void {
  execSync("git init", { cwd: workspace, stdio: "ignore" });
  execSync("git config user.email test@example.com", { cwd: workspace, stdio: "ignore" });
  execSync("git config user.name test", { cwd: workspace, stdio: "ignore" });
  execSync(`git add ${repoRelativePath}`, { cwd: workspace, stdio: "ignore" });
  execSync('git commit -m "track orphan for test"', { cwd: workspace, stdio: "ignore" });
}

describe("company events adopt / orphans", () => {
  const env = { ...process.env };
  let restore: () => void;

  beforeEach(() => {
    restore = setupTempCompanyEventsTenant().restore;
    process.env.STEWARD_OPERATOR_AUTH = "1";
    process.env.ORGOS_CLI_OPERATOR_ID = HA_CEO_ID;
    process.env.ORGOS_OPERATOR_KEY = HA_CEO_KEY;
    initCompanyEventsFile();
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    restore();
  });

  it("adopt preserves id and occurred_at and appends create chain link", () => {
    writeOrphanMarkdown(ORPHAN_ID, ORPHAN_MONTH);
    expect(listOrphanEventMarkdown().some((o) => o.id === ORPHAN_ID)).toBe(true);

    const beforeLinks = loadCompanyEventChain().length;
    const result = adoptCompanyEventFromMarkdown(ORPHAN_ID);
    expect(result.dry_run).toBe(false);
    expect(result.event.id).toBe(ORPHAN_ID);
    expect(result.event.occurred_at).toBe("2099-01-01");
    expect(result.chain_seq).toBeGreaterThan(0);

    const registry = loadCompanyEvents();
    expect(registry.events.some((e) => e.id === ORPHAN_ID)).toBe(true);
    const chain = loadCompanyEventChain();
    expect(chain.length).toBe(beforeLinks + 1);
    expect(chain.at(-1)?.action).toBe("create");
    expect(chain.at(-1)?.event_id).toBe(ORPHAN_ID);

    const validation = validateCompanyEvents();
    expect(validation.ok).toBe(true);
    expect(validation.issues.filter((i) => i.code === "orphan_markdown")).toHaveLength(0);
  });

  it("dry-run adopt writes nothing", () => {
    writeOrphanMarkdown(ORPHAN_ID, ORPHAN_MONTH);
    const registryPath = join(
      process.env.ORGOS_WORKSPACE!,
      "tenants",
      "ha-iso",
      "data",
      "company-events.yaml",
    );
    const beforeRegistry = readFileSync(registryPath, "utf8");
    adoptCompanyEventFromMarkdown(ORPHAN_ID, { dryRun: true });
    const afterRegistry = readFileSync(registryPath, "utf8");
    expect(afterRegistry).toBe(beforeRegistry);
    expect(loadCompanyEvents().events.some((e) => e.id === ORPHAN_ID)).toBe(false);
  });

  it("prune skips git-tracked orphans and deletes untracked", () => {
    const trackedId = "EVT-20990102-finance-tracked-orphan";
    const untrackedId = "EVT-20990103-finance-untracked-orphan";
    const trackedRel = writeOrphanMarkdown(trackedId, ORPHAN_MONTH);
    writeOrphanMarkdown(untrackedId, ORPHAN_MONTH);
    gitTrack(process.env.ORGOS_WORKSPACE!, trackedRel);

    const result = pruneOrphanEventMarkdown({ iUnderstandPurge: true });
    expect(result.skipped_tracked).toContain(trackedId);
    expect(result.deleted).toContain(untrackedId);
    expect(existsSync(join(getDocsCompanyEventsDir(), ORPHAN_MONTH, `${trackedId}.md`))).toBe(true);
    expect(existsSync(join(getDocsCompanyEventsDir(), ORPHAN_MONTH, `${untrackedId}.md`))).toBe(false);
  });
});
