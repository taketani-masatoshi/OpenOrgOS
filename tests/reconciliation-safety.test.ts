import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import * as utils from "../src/lib/utils.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { clearTenantId, setTenantId } from "../src/lib/tenant.js";
import {
  applyApprovedBankReconciliation,
  listBankReconciliationWorkbench,
} from "../src/lib/finance/bank-reconcile-apply.js";
import { loadBankStatementsLite } from "../src/lib/finance/bank-statements-lite.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { lockMonth } from "../src/lib/finance/period-lock.js";
import { loadReconciliationEventFile } from "../src/lib/jp-bank-corporate/reconciliation-store.js";
import { reconciliationPendingPath } from "../src/lib/finance/reconciliation-transaction.js";

describe("reconciliation safety", () => {
  let workspace: string;
  let dir: string;
  const prior = { ...process.env };
  const date = "2026-08-15";
  const put = (name: string, value: unknown) =>
    writeFileSync(join(dir, name), YAML.stringify(value));
  const apply = () =>
    applyApprovedBankReconciliation({
      bankId: "B-1",
      arApId: "AR-1",
      amount: 100,
      reason: "synthetic test",
      authorizedBy: "OP-TEST",
      effectiveDate: date,
    });
  beforeEach(() => {
    workspace = mkdtempSync(
      join(process.env.ORGOS_CUSTOMER_JOURNEY_RUN_ROOT ?? tmpdir(), "reconciliation-safety-")
    );
    // Copy only the committed synthetic fixture; never restore operational tenants.
    execFileSync("tar", ["-x", "-C", workspace], {
      input: execFileSync("git", ["archive", "HEAD", "tenants/_fixture-books"]),
    });
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_TENANT = "_fixture-books";
    refreshOrgOsPaths();
    clearTenantId();
    setTenantId("_fixture-books");
    dir = join(workspace, "tenants/_fixture-books/data/finance");
    put("bank-statements.yaml", {
      as_of: date,
      entries: [
        {
          id: "B-1",
          date,
          direction: "inflow",
          amount: 100,
          category: "receipt",
          description: "synthetic",
          account_id: "BANK-001",
          reference: "AR-1",
          status: "unmatched",
        },
      ],
    });
    put("ar-ap-ledger.yaml", {
      entries: [
        {
          id: "AR-1",
          kind: "ar",
          amount: 100,
          booked_date: date,
          due_date: date,
          counterparty: "SYNTHETIC",
          description: "synthetic",
          account_id: "BANK-001",
        },
      ],
    });
    put("journal-entries.yaml", { version: 1, entries: [] });
    put("period-locks.yaml", { version: 1, locks: [] });
    rmSync(join(dir, "reconciliation-events.yaml"), { force: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...prior };
    refreshOrgOsPaths();
    clearTenantId();
    rmSync(workspace, { recursive: true, force: true });
  });
  it("rejects a locked effective month without writing either ledger", () => {
    lockMonth({ month: "2026-08", lockedBy: "OP-TEST" });
    const before = readFileSync(join(dir, "journal-entries.yaml"), "utf8");
    expect(apply).toThrow(/locked/);
    expect(readFileSync(join(dir, "journal-entries.yaml"), "utf8")).toBe(before);
    expect(existsSync(join(dir, "reconciliation-events.yaml"))).toBe(false);
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("unmatched");
  });
  it("uses the effective date for both settlement and journal, and refuses duplicate settlement", () => {
    apply();
    expect(loadReconciliationEventFile().events[0]?.effective_date).toBe(date);
    expect(loadJournalEntries().entries[0]?.occurred_at).toBe(`${date}T00:00:00.000Z`);
    expect(loadBankStatementsLite(date)?.entries[0]?.status).toBe("matched");
    expect(apply).toThrow(/already settled/);
    expect(loadJournalEntries().entries).toHaveLength(1);
    expect(loadReconciliationEventFile().events).toHaveLength(1);
  });
  it("restores both byte-exact preimages even when the second write throws after changing its file", () => {
    put("reconciliation-events.yaml", { version: "1", events: [] });
    const names = ["journal-entries.yaml", "reconciliation-events.yaml"];
    const before = names.map((n) => readFileSync(join(dir, n), "utf8"));
    const original = utils.writeYamlFile;
    vi.spyOn(utils, "writeYamlFile").mockImplementation((path, data) => {
      original(path, data);
      if (path.endsWith("reconciliation-events.yaml")) throw new Error("synthetic disk failure");
    });
    expect(apply).toThrow(/synthetic disk failure/);
    expect(names.map((n) => readFileSync(join(dir, n), "utf8"))).toEqual(before);
    expect(existsSync(reconciliationPendingPath())).toBe(false);
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("unmatched");
  });
  it("blocks readers and new mutations after an interrupted commit", () => {
    mkdirSync(reconciliationPendingPath());
    expect(loadJournalEntries).toThrow(/incomplete/);
    expect(loadReconciliationEventFile).toThrow(/incomplete/);
    expect(listBankReconciliationWorkbench).toThrow(/incomplete/);
    expect(apply).toThrow(/incomplete/);
    expect(() => lockMonth({ month: "2026-08", lockedBy: "OP-TEST" })).toThrow(/incomplete/);
  });
  it("reports corrupt events as unavailable instead of zero unmatched", () => {
    writeFileSync(join(dir, "reconciliation-events.yaml"), "events: [invalid");
    expect(loadBankStatementsLite()).toBeNull();
    expect(listBankReconciliationWorkbench).toThrow(/unavailable/);
  });
  it("preserves legacy settled snapshots with empty or unrelated event history", () => {
    const bank = YAML.parse(readFileSync(join(dir, "bank-statements.yaml"), "utf8"));
    bank.entries[0].status = "matched";
    put("bank-statements.yaml", bank);
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("matched");
    put("reconciliation-events.yaml", { version: "1", events: [] });
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("matched");
    expect(listBankReconciliationWorkbench().proposals).toEqual([]);
    expect(apply).toThrow(/already settled/);
    bank.entries.push({ ...bank.entries[0], id: "B-2", status: "unmatched" });
    put("bank-statements.yaml", bank);
    applyApprovedBankReconciliation({
      bankId: "B-2",
      arApId: "AR-1",
      amount: 100,
      reason: "synthetic",
      authorizedBy: "OP-TEST",
      effectiveDate: date,
    });
    expect(loadBankStatementsLite()?.entries.map((e) => e.status)).toEqual(["matched", "matched"]);
  });
  it("keeps unknown legacy partial balances blocked rather than inventing a remaining amount", () => {
    const bank = YAML.parse(readFileSync(join(dir, "bank-statements.yaml"), "utf8"));
    bank.entries[0].status = "partial";
    put("bank-statements.yaml", bank);
    put("reconciliation-events.yaml", { version: "1", events: [] });
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("partial");
    expect(listBankReconciliationWorkbench).toThrow(/legacy partial balance/);
    expect(apply).toThrow(/migration/);
  });
});
