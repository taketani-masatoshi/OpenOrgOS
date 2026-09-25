import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { clearTenantId, setTenantId } from "../src/lib/tenant.js";
import { hashOperatorKey } from "../src/lib/org/operators.js";
import {
  reconciliationPendingPath,
  recoverPendingReconciliation,
  assertReconciliationReadable,
  withReconciliationTransaction,
} from "../src/lib/finance/reconciliation-transaction.js";
import { digest, readRecoveryAudit } from "../src/lib/finance/reconciliation-recovery-audit.js";
import { withFinanceFileLock } from "../src/lib/finance/finance-mutation-lock.js";
import { fsSync } from "../src/lib/finance/fs-sync.js";

const actualRename = fs.renameSync;

describe("reconciliation recovery", () => {
  const prior = { ...process.env };
  const before = "version: 1\nentries: []\n";
  let root: string, dir: string, key: string;
  const opts = () => ({
    confirm: true,
    operatorId: "OP-TEST",
    operatorKey: key,
    reason: "synthetic crash recovery",
  });
  function operator(extra = {}) {
    fs.writeFileSync(
      join(dir, "../org/operators.yaml"),
      YAML.stringify({
        version: "1",
        operators: [
          {
            operator_id: "OP-TEST",
            display_name: "Synthetic approver",
            role: "ceo",
            status: "active",
            key_hash: hashOperatorKey(key),
            ...extra,
          },
        ],
      })
    );
  }
  function pending() {
    const path = reconciliationPendingPath();
    fs.mkdirSync(path);
    fs.writeFileSync(join(path, "transaction-id"), randomUUID());
    fs.writeFileSync(
      join(path, "before.json"),
      JSON.stringify([
        {
          name: "journal-entries.yaml",
          base64: Buffer.from(before).toString("base64"),
          sha256: digest(before),
        },
        { name: "reconciliation-events.yaml", base64: null },
      ])
    );
    fs.writeFileSync(join(dir, "journal-entries.yaml"), "interrupted write\n");
    return path;
  }
  beforeEach(() => {
    root = fs.mkdtempSync(join(tmpdir(), "reconciliation-recovery-"));
    process.env.ORGOS_WORKSPACE = root;
    process.env.ORGOS_TENANT = "synthetic";
    delete process.env.ORGOS_OPERATOR_KEY;
    refreshOrgOsPaths();
    clearTenantId();
    fs.mkdirSync(join(root, "tenants/synthetic/data/org"), { recursive: true });
    fs.writeFileSync(join(root, "tenants/synthetic/tenant.yaml"), "tenant_id: synthetic\n");
    setTenantId("synthetic");
    dir = join(root, "tenants/synthetic/data/finance");
    fs.mkdirSync(dir);
    key = randomUUID();
    operator();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...prior };
    refreshOrgOsPaths();
    clearTenantId();
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("requires explicit consent and a valid key even with dev authentication disabled", () => {
    pending();
    process.env.STEWARD_OPERATOR_AUTH = "0";
    expect(() => recoverPendingReconciliation()).toThrow(/confirm/);
    expect(() => recoverPendingReconciliation({ ...opts(), operatorKey: "wrong" })).toThrow(/key/);
    expect(() => recoverPendingReconciliation({ ...opts(), operatorId: "arbitrary" })).toThrow(
      /key/
    );
    expect(readRecoveryAudit(dir)).toEqual([]);
    expect(fs.readFileSync(join(dir, "journal-entries.yaml"), "utf8")).toContain("interrupted");
  });
  it.each([
    { role: "mcp_service", permissions: ["finance:reconcile"] },
    { role: "readonly" },
    { status: "disabled" },
    { guest_expires_at: "2020-01-01" },
    { guest_expires_at: "invalid" },
  ])("rejects an ineligible current operator: %j", (record) => {
    pending();
    operator(record);
    expect(() => recoverPendingReconciliation(opts())).toThrow(/human finance approver/);
  });
  it("restores byte-exact preimages, records completion afterwards, and is idempotent", () => {
    pending();
    fs.mkdirSync(join(dir, ".reconciliation-recovery"));
    expect(recoverPendingReconciliation(opts()).status).toBe("restored");
    expect(fs.readFileSync(join(dir, "journal-entries.yaml"), "utf8")).toBe(before);
    expect(fs.existsSync(join(dir, "reconciliation-events.yaml"))).toBe(false);
    expect(readRecoveryAudit(dir).map((e) => e.event)).toEqual(["started", "completed"]);
    expect(recoverPendingReconciliation(opts()).status).toBe("none");
    expect(readRecoveryAudit(dir)).toHaveLength(2);
    expect(assertReconciliationReadable).not.toThrow();
  });
  it("leaves no false completion on a failed restore and permits retry", () => {
    const path = pending();
    vi.spyOn(fsSync, "renameSync").mockImplementation(((from, to, ...rest) => {
      if (String(to).endsWith("journal-entries.yaml")) throw new Error("synthetic disk failure");
      return actualRename(from, to, ...(rest as []));
    }) as typeof fsSync.renameSync);
    expect(() => recoverPendingReconciliation(opts())).toThrow(/disk failure/);
    expect(readRecoveryAudit(dir).map((e) => e.event)).toEqual(["started", "failed"]);
    expect(fs.existsSync(path)).toBe(true);
    expect(assertReconciliationReadable).toThrow(/incomplete/);
    vi.mocked(fsSync.renameSync).mockRestore();
    expect(recoverPendingReconciliation(opts()).status).toBe("restored");
    expect(readRecoveryAudit(dir).filter((e) => e.event === "completed")).toHaveLength(1);
  });
  it("retries cleanup without duplicate completion or a lost recovery record", () => {
    pending();
    vi.spyOn(fsSync, "renameSync").mockImplementation(((from, to, ...rest) => {
      if (String(to).includes(".reconciliation-finished-"))
        throw new Error("synthetic cleanup failure");
      return actualRename(from, to, ...(rest as []));
    }) as typeof fsSync.renameSync);
    expect(() => recoverPendingReconciliation(opts())).toThrow(/cleanup failure/);
    expect(fs.existsSync(join(reconciliationPendingPath(), "before.json"))).toBe(true);
    vi.mocked(fsSync.renameSync).mockRestore();
    recoverPendingReconciliation(opts());
    expect(readRecoveryAudit(dir).filter((e) => e.event === "completed")).toHaveLength(1);
  });
  it("rejects altered preimages before modifying the ledger", () => {
    const path = pending();
    const entries = JSON.parse(fs.readFileSync(join(path, "before.json"), "utf8"));
    entries[0].base64 = Buffer.from("changed").toString("base64");
    fs.writeFileSync(join(path, "before.json"), JSON.stringify(entries));
    expect(() => recoverPendingReconciliation(opts())).toThrow(/hash mismatch/);
    expect(readRecoveryAudit(dir)).toEqual([]);
  });
  it("detects changed committed audit events and ignores unpublished temp records", () => {
    pending();
    recoverPendingReconciliation(opts());
    const auditDir = join(dir, ".reconciliation-recovery-audit");
    fs.writeFileSync(join(auditDir, "torn.tmp"), "{incomplete");
    expect(readRecoveryAudit(dir)).toHaveLength(2);
    const path = join(
      auditDir,
      fs.readdirSync(auditDir).find((n) => n.endsWith(".json"))!
    );
    const record = JSON.parse(fs.readFileSync(path, "utf8"));
    record.reason = "changed";
    fs.writeFileSync(path, JSON.stringify(record));
    pending();
    expect(() => recoverPendingReconciliation(opts())).toThrow(/audit chain/);
  });
  it("does not roll back a durable commit when cleanup fails", () => {
    fs.writeFileSync(join(dir, "journal-entries.yaml"), before);
    vi.spyOn(fsSync, "renameSync").mockImplementation(((from, to, ...rest) => {
      if (String(to).includes(".reconciliation-finished-")) throw new Error("cleanup failed");
      return actualRename(from, to, ...(rest as []));
    }) as typeof fsSync.renameSync);
    expect(() =>
      withReconciliationTransaction(() =>
        fs.writeFileSync(join(dir, "journal-entries.yaml"), "committed")
      )
    ).toThrow(/committed/);
    expect(fs.readFileSync(join(dir, "journal-entries.yaml"), "utf8")).toBe("committed");
    vi.mocked(fsSync.renameSync).mockRestore();
    expect(recoverPendingReconciliation(opts()).status).toBe("committed");
    expect(fs.readFileSync(join(dir, "journal-entries.yaml"), "utf8")).toBe("committed");
  });
  it("recovers after a real SIGKILL leaves a pending transaction and dead lock", () => {
    fs.writeFileSync(join(dir, "journal-entries.yaml"), before);
    const module = pathToFileURL(resolve("src/lib/finance/reconciliation-transaction.ts")).href;
    const code = `import {withReconciliationTransaction} from ${JSON.stringify(module)}; import {writeFileSync} from 'node:fs'; withReconciliationTransaction(() => {writeFileSync(${JSON.stringify(join(dir, "journal-entries.yaml"))}, 'partial'); process.kill(process.pid, 'SIGKILL');});`;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code],
      { env: process.env, encoding: "utf8", timeout: 15000 }
    );
    expect(child.signal, child.stderr).toBe("SIGKILL");
    expect(assertReconciliationReadable).toThrow(/incomplete/);
    expect(recoverPendingReconciliation(opts()).status).toBe("restored");
    expect(fs.readFileSync(join(dir, "journal-entries.yaml"), "utf8")).toBe(before);
  });
  it("cannot reap a lock held by a live writer", () => {
    pending();
    withFinanceFileLock(dir, () =>
      expect(() => recoverPendingReconciliation(opts())).toThrow(/live writer/)
    );
  });

  it("serializes competing processes, including a recovery contender", async () => {
    const counter = join(dir, "synthetic-counter");
    fs.writeFileSync(counter, "0");
    const module = pathToFileURL(resolve("src/lib/finance/finance-mutation-lock.ts")).href;
    const run = (recover: boolean) =>
      new Promise<void>((done, reject) => {
        const code = `import {withFinanceFileLock} from ${JSON.stringify(module)}; import {readFileSync,writeFileSync} from 'node:fs'; for(let i=0;i<12;i++)withFinanceFileLock(${JSON.stringify(dir)},()=>{ const n=Number(readFileSync(${JSON.stringify(counter)},'utf8')); const end=Date.now()+5; while(Date.now()<end){}; writeFileSync(${JSON.stringify(counter)},String(n+1)); },${recover});`;
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", code],
          { env: process.env, stdio: ["ignore", "ignore", "pipe"] }
        );
        let error = "";
        child.stderr.on("data", (data) => {
          error += String(data);
        });
        child.on("error", reject);
        child.on("close", (status) => (status === 0 ? done() : reject(new Error(error))));
      });
    await Promise.all([run(false), run(true)]);
    expect(fs.readFileSync(counter, "utf8")).toBe("24");
  });

  it("distinguishes a missing file from a committed empty file", () => {
    const path = pending();
    fs.writeFileSync(
      join(path, "commit.json"),
      JSON.stringify({
        version: 2,
        hashes: {
          "journal-entries.yaml": digest("interrupted write\n"),
          "reconciliation-events.yaml": digest(""),
        },
      })
    );
    expect(() => recoverPendingReconciliation(opts())).toThrow(/does not match/);
    expect(readRecoveryAudit(dir).some((e) => e.event === "completed")).toBe(false);
  });
});
