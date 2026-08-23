import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCompanyEvent,
  closeCompanyEvent,
  ensureCompanyEventMonth,
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
import { getDataDir } from "../src/lib/utils.js";
import { writeYamlFile } from "../src/lib/utils.js";
import {
  pinCompanyEventChainTail,
  verifyCompanyEventsWitnessPin,
} from "../src/lib/company-events-witness-pin.js";
import { setupTempCompanyEventsTenant } from "./helpers/temp-company-events-tenant.js";

const CHAIN_PATH = () => join(getDataDir(), "company-events-chain.jsonl");

describe("company-events-chain", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupTempCompanyEventsTenant().restore;
  });

  afterEach(() => {
    restore();
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

    const { voidEvent, target: voided } = voidCompanyEvent(target.id, "duplicate entry");

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

    const registry = loadCompanyEvents();
    registry.events = registry.events.filter((e) => e.id !== event.id);
    saveCompanyEvents(registry);

    const result = validateCompanyEvents();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "chain-orphan-create")).toBe(true);
  });

  it("detects missing line in JSONL chain", () => {
    ensureCompanyEventMonth("2100-02");
    createCompanyEvent({
      kind: "misc",
      title: "Chain gap a",
      occurredAt: "2100-02-01",
      slug: "chain-gap-a",
    });
    createCompanyEvent({
      kind: "misc",
      title: "Chain gap b",
      occurredAt: "2100-02-02",
      slug: "chain-gap-b",
    });

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
    voidCompanyEvent(target.id, "first void");
    expect(() => voidCompanyEvent(target.id, "second void")).toThrow(/already voided/);
  });

  it("backfills create links for existing registry after chain file is removed", () => {
    ensureCompanyEventMonth("2100-04");
    createCompanyEvent({
      kind: "misc",
      title: "Backfill me",
      occurredAt: "2100-04-01",
      slug: "backfill-me",
    });
    if (existsSync(CHAIN_PATH())) {
      rmSync(CHAIN_PATH());
    }

    const registry = loadCompanyEvents();
    const result = backfillCompanyEventChain(registry);
    saveCompanyEvents(result.registry);

    expect(result.links).toBeGreaterThanOrEqual(1);
    expect(loadCompanyEventChain().length).toBeGreaterThanOrEqual(1);
    expect(validateCompanyEvents().issues.some((i) => i.code === "chain-missing-create")).toBe(false);
  });

  it("rejects public skipChain on create and still appends void compensation links", () => {
    expect(() =>
      createCompanyEvent({
        kind: "misc",
        title: "Skip banned",
        occurredAt: "2100-06-01",
        slug: "skip-banned",
        skipChain: true,
      } as never),
    ).toThrow(/skipChain is not a public option/);

    ensureCompanyEventMonth("2100-06");
    const target = createCompanyEvent({
      kind: "misc",
      title: "Void still chains",
      occurredAt: "2100-06-02",
      slug: "void-still-chains",
    });
    const before = loadCompanyEventChain().length;
    voidCompanyEvent(target.id, "internal skip remains");
    expect(loadCompanyEventChain().length).toBe(before + 2);
  });

  it("refuses --force rebuild without ORGOS_EVENTS_CHAIN_REBUILD", () => {
    ensureCompanyEventMonth("2100-07");
    createCompanyEvent({
      kind: "misc",
      title: "Force guard",
      occurredAt: "2100-07-01",
      slug: "force-guard",
    });
    const before = readFileSync(CHAIN_PATH(), "utf8");
    delete process.env.ORGOS_EVENTS_CHAIN_REBUILD;
    expect(() => backfillCompanyEventChain(loadCompanyEvents(), { force: true })).toThrow(
      /ORGOS_EVENTS_CHAIN_REBUILD/,
    );
    expect(readFileSync(CHAIN_PATH(), "utf8")).toBe(before);
  });

  it("close appends a status chain link", () => {
    ensureCompanyEventMonth("2100-05");
    const event = createCompanyEvent({
      kind: "misc",
      title: "Close chain",
      occurredAt: "2100-05-01",
      slug: "close-chain",
    });
    const before = loadCompanyEventChain().length;

    closeCompanyEvent(event.id);

    const chain = loadCompanyEventChain();
    expect(chain.length).toBe(before + 1);
    expect(chain.at(-1)?.action).toBe("status");
    expect(chain.at(-1)?.event_id).toBe(event.id);
  });

  it("pins chain tail and fails when the pinned link is rewritten", () => {
    ensureCompanyEventMonth("2100-08");
    createCompanyEvent({
      kind: "misc",
      title: "Pin me",
      occurredAt: "2100-08-01",
      slug: "pin-me",
    });
    const pin = pinCompanyEventChainTail();
    expect(verifyCompanyEventsWitnessPin().ok).toBe(true);
    expect(pin.chain_tail_digest).toHaveLength(64);

    const lines = readFileSync(CHAIN_PATH(), "utf8").trim().split("\n");
    const first = JSON.parse(lines[0]!) as { digest: string; seq: number };
    first.digest = "a".repeat(64);
    writeFileSync(CHAIN_PATH(), `${JSON.stringify(first)}\n`, "utf8");
    expect(verifyCompanyEventsWitnessPin().ok).toBe(false);
  });

  it("rejects writeYamlFile of company-events.yaml outside the events CLI guard", () => {
    expect(() =>
      writeYamlFile(join(getDataDir(), "company-events.yaml"), { schema_version: 2, events: [] }),
    ).toThrow(/Company events write rejected/);
  });
});
