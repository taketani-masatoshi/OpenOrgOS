import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  createCompanyEvent,
  closeCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
  loadCompanyEvents,
  saveCompanyEvents,
  validateCompanyEvents,
  voidCompanyEvent,
  backfillCompanyEventChain,
} from "../src/lib/company-events.js";
import {
  loadCompanyEventChain,
  verifyCompanyEventChain,
} from "../src/lib/company-events-chain.js";
import { getDataDir, resolveTenantPath } from "../src/lib/utils.js";

const REGISTRY_PATH = () => join(getDataDir(), "company-events.yaml");
const CHAIN_PATH = () => join(getDataDir(), "company-events-chain.jsonl");
const REGISTRY_BACKUP = join(tmpdir(), "steward-company-events-chain-registry-backup.yaml");
const CHAIN_BACKUP = join(tmpdir(), "steward-company-events-chain-backup.jsonl");

function backupChainState(): void {
  initCompanyEventsFile();
  if (existsSync(REGISTRY_PATH())) {
    copyFileSync(REGISTRY_PATH(), REGISTRY_BACKUP);
  }
  if (existsSync(CHAIN_PATH())) {
    copyFileSync(CHAIN_PATH(), CHAIN_BACKUP);
  } else if (existsSync(CHAIN_BACKUP)) {
    unlinkSync(CHAIN_BACKUP);
  }
}

function restoreChainState(): void {
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
}

function resetChainTestState(): void {
  writeFileSync(REGISTRY_PATH(), "schema_version: 2\nevents: []\n", "utf8");
  if (existsSync(CHAIN_PATH())) {
    unlinkSync(CHAIN_PATH());
  }
}

describe("company-events-chain", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    backupChainState();
    resetChainTestState();
    created.length = 0;
  });

  afterEach(() => {
    for (const rel of created) {
      const abs = resolveTenantPath(rel);
      if (existsSync(abs)) {
        rmSync(abs, { recursive: true, force: true });
      }
    }
    restoreChainState();
  });

  it("chains three create events with continuous seq and digests", () => {
    ensureCompanyEventMonth("2099-11");
    const e1 = createCompanyEvent({
      kind: "misc",
      title: "Chain one",
      occurredAt: "2099-11-01",
      slug: "chain-one",
    });
    const e2 = createCompanyEvent({
      kind: "misc",
      title: "Chain two",
      occurredAt: "2099-11-02",
      slug: "chain-two",
    });
    const e3 = createCompanyEvent({
      kind: "misc",
      title: "Chain three",
      occurredAt: "2099-11-03",
      slug: "chain-three",
    });
    created.push(e1.event_path, e1.artifact_dir, e2.event_path, e2.artifact_dir, e3.event_path, e3.artifact_dir);

    const chain = loadCompanyEventChain();
    expect(chain).toHaveLength(3);
    expect(chain.map((l) => l.seq)).toEqual([1, 2, 3]);
    expect(chain[0]!.prev_digest).toBeNull();
    expect(chain[1]!.prev_digest).toBe(chain[0]!.digest);
    expect(chain[2]!.prev_digest).toBe(chain[1]!.digest);

    const verify = verifyCompanyEventChain();
    expect(verify.ok).toBe(true);
    expect(validateCompanyEvents().ok).toBe(true);
    expect(e1.chain_seq).toBe(1);
    expect(e3.chain_seq).toBe(3);
  });

  it("void creates void EVT, void link, and marks target voided", () => {
    ensureCompanyEventMonth("2099-12");
    const target = createCompanyEvent({
      kind: "contract",
      title: "Void target",
      occurredAt: "2099-12-01",
      slug: "void-target",
    });
    created.push(target.event_path, target.artifact_dir);

    const { voidEvent, target: voided } = voidCompanyEvent(target.id, "duplicate entry");
    created.push(voidEvent.event_path, voidEvent.artifact_dir);

    expect(voided.status).toBe("voided");
    expect(voided.voided_by).toBe(voidEvent.id);
    expect(voidEvent.kind).toBe("void");

    const chain = loadCompanyEventChain();
    expect(chain).toHaveLength(3);
    expect(chain[1]!.action).toBe("create");
    expect(chain[1]!.event_id).toBe(voidEvent.id);
    expect(chain[2]!.action).toBe("void");
    expect(chain[2]!.target_event_id).toBe(target.id);

    expect(validateCompanyEvents().ok).toBe(true);
  });

  it("detects registry event removed without void link", () => {
    ensureCompanyEventMonth("2100-01");
    const event = createCompanyEvent({
      kind: "finance",
      title: "Tamper target",
      occurredAt: "2100-01-01",
      slug: "tamper-target",
    });
    created.push(event.event_path, event.artifact_dir);

    const registry = loadCompanyEvents();
    registry.events = registry.events.filter((e) => e.id !== event.id);
    saveCompanyEvents(registry);

    const result = validateCompanyEvents();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "chain-orphan-create")).toBe(true);
  });

  it("detects missing line in JSONL chain", () => {
    ensureCompanyEventMonth("2100-02");
    const e1 = createCompanyEvent({
      kind: "misc",
      title: "Chain gap a",
      occurredAt: "2100-02-01",
      slug: "chain-gap-a",
    });
    const e2 = createCompanyEvent({
      kind: "misc",
      title: "Chain gap b",
      occurredAt: "2100-02-02",
      slug: "chain-gap-b",
    });
    created.push(e1.event_path, e1.artifact_dir, e2.event_path, e2.artifact_dir);

    const lines = readFileSync(CHAIN_PATH(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    writeFileSync(CHAIN_PATH(), `${lines[0]}\n`, "utf8");

    const result = validateCompanyEvents();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "chain-missing-create")).toBe(true);
  });

  it("rejects double void", () => {
    ensureCompanyEventMonth("2100-03");
    const target = createCompanyEvent({
      kind: "misc",
      title: "Double void",
      occurredAt: "2100-03-01",
      slug: "double-void",
    });
    created.push(target.event_path, target.artifact_dir);
    const first = voidCompanyEvent(target.id, "first void");
    created.push(first.voidEvent.event_path, first.voidEvent.artifact_dir);
    expect(() => voidCompanyEvent(target.id, "second void")).toThrow(/already voided/);
  });

  it("backfills create links for existing registry", () => {
    ensureCompanyEventMonth("2100-04");
    const event = createCompanyEvent({
      kind: "misc",
      title: "Backfill me",
      occurredAt: "2100-04-01",
      slug: "backfill-me",
      skipChain: true,
    });
    created.push(event.event_path, event.artifact_dir);
    if (existsSync(CHAIN_PATH())) {
      unlinkSync(CHAIN_PATH());
    }

    const registry = loadCompanyEvents();
    const result = backfillCompanyEventChain(registry);
    saveCompanyEvents(result.registry);

    expect(result.links).toBeGreaterThanOrEqual(1);
    expect(loadCompanyEventChain().length).toBeGreaterThanOrEqual(1);
    expect(validateCompanyEvents().issues.some((i) => i.code === "chain-missing-create")).toBe(false);
  });

  it("close appends a status chain link", () => {
    ensureCompanyEventMonth("2100-05");
    const event = createCompanyEvent({
      kind: "misc",
      title: "Close chain",
      occurredAt: "2100-05-01",
      slug: "close-chain",
    });
    created.push(event.event_path, event.artifact_dir);
    const before = loadCompanyEventChain().length;

    closeCompanyEvent(event.id);

    const chain = loadCompanyEventChain();
    expect(chain.length).toBe(before + 1);
    expect(chain.at(-1)?.action).toBe("status");
    expect(chain.at(-1)?.event_id).toBe(event.id);
  });
});
