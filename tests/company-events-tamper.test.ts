import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCompanyEvent,
  closeCompanyEvent,
  ensureCompanyEventMonth,
  loadCompanyEvents,
  saveCompanyEvents,
} from "../src/lib/company-events.js";
import {
  loadCompanyEventChain,
  crossCheckChainWithRegistry,
  validateCompanyEventChainWithRegistry,
  verifyCompanyEventChain,
} from "../src/lib/company-events-chain.js";
import { getDataDir, writeYamlFile } from "../src/lib/utils.js";
import { setupTempCompanyEventsTenant } from "./helpers/temp-company-events-tenant.js";

describe("company-events tamper detection", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupTempCompanyEventsTenant().restore;
    ensureCompanyEventMonth("2099-06");
    createCompanyEvent({
      kind: "misc",
      title: "Tamper probe",
      occurredAt: "2099-06-01",
      slug: "tamper-probe",
    });
    const toClose = createCompanyEvent({
      kind: "contract",
      title: "Close me",
      occurredAt: "2099-06-02",
      slug: "close-me",
    });
    closeCompanyEvent(toClose.id);
  });

  afterEach(() => restore());

  it("detects registry title tampering", () => {
    const registry = loadCompanyEvents();
    registry.events[0]!.title = "Tampered title";
    saveCompanyEvents(registry);
    const cross = crossCheckChainWithRegistry(registry);
    expect(cross.some((i) => i.code === "chain-payload-digest-mismatch")).toBe(true);
  });

  it("detects registry kind tampering", () => {
    const registry = loadCompanyEvents();
    registry.events[0]!.kind = "finance";
    saveCompanyEvents(registry);
    const cross = crossCheckChainWithRegistry(registry);
    expect(cross.some((i) => i.code === "chain-payload-digest-mismatch")).toBe(true);
  });

  it("detects registry status tampering without status link", () => {
    const registry = loadCompanyEvents();
    const openEvent = registry.events.find((e) => e.status === "open" && e.kind !== "void");
    expect(openEvent).toBeTruthy();
    openEvent!.status = "closed";
    saveCompanyEvents(registry);
    const cross = crossCheckChainWithRegistry(registry);
    expect(
      cross.some(
        (i) => i.code === "chain-missing-status" || i.code === "chain-payload-digest-mismatch"
      )
    ).toBe(true);
  });

  it("detects link_id tampering", () => {
    const chainPath = join(getDataDir(), "company-events-chain.jsonl");
    const lines = readFileSync(chainPath, "utf8").split("\n").filter(Boolean);
    const link = JSON.parse(lines[0]!) as Record<string, unknown>;
    link.link_id = "CEL-999";
    lines[0] = JSON.stringify(link);
    writeFileSync(chainPath, lines.join("\n") + "\n");
    const verify = verifyCompanyEventChain();
    expect(verify.issues.some((i) => i.code === "chain-link-id-mismatch")).toBe(true);
  });

  it("detects recorded_at regression", () => {
    const chainPath = join(getDataDir(), "company-events-chain.jsonl");
    const lines = readFileSync(chainPath, "utf8").split("\n").filter(Boolean);
    if (lines.length < 2) return;
    const link = JSON.parse(lines[1]!) as Record<string, unknown>;
    link.recorded_at = "2000-01-01T00:00:00.000Z";
    lines[1] = JSON.stringify(link);
    writeFileSync(chainPath, lines.join("\n") + "\n");
    const verify = verifyCompanyEventChain();
    expect(verify.issues.some((i) => i.code === "chain-recorded-at-regression")).toBe(true);
  });

  it("detects corrupt trailing JSONL line", () => {
    const chainPath = join(getDataDir(), "company-events-chain.jsonl");
    writeFileSync(chainPath, readFileSync(chainPath, "utf8") + "{not-json\n", "utf8");
    const verify = verifyCompanyEventChain();
    expect(verify.issues.some((i) => i.code === "chain-corrupt-line")).toBe(true);
    expect(loadCompanyEventChain().length).toBeGreaterThan(0);
  });
});
