/**
 * OOO gate parity: claims hardening, Slack channel, audit trail.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { listAuditEvents } from "../src/lib/audit-log.js";
import {
  assertOutboundCorrespondenceDraft,
  assertOutboundSlackDraft,
  assertFulfillmentLanguage,
  CorrespondenceClaimsError,
  extractAmounts,
  normalizeCorrespondenceBody,
} from "../src/lib/correspondence/claims-assert.js";
import {
  createCorrespondenceDraft,
  loadCorrespondenceDraft,
} from "../src/lib/correspondence/draft.js";
import { recordCorrespondenceGateRejection } from "../src/lib/correspondence/correspondence-gate-audit.js";
import type { CorrespondenceClaim } from "../src/lib/correspondence/facts-verify.js";

function seedContact(email: string, id = "EXT-OOO"): void {
  const execDir = join(getDataDir(), "executive");
  mkdirSync(execDir, { recursive: true });
  writeFileSync(
    join(execDir, "external-contacts.yaml"),
    YAML.stringify({
      contacts: [{ id, name: "Partner", org: "Example", email }],
    }),
    "utf-8",
  );
}

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "executive", "external-contacts.yaml"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
    join(getDocsDir(), "reports", "audit-log"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
}

describe("correspondence OOO gate closure", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    process.env.ORGOS_AUDIT_BRIDGE_DISABLED = "1";
    seedContact("partner@example.com");
  });
  afterEach(() => cleanup());

  it("extractAmounts handles full-width digits and 万円", () => {
    expect(extractAmounts("お見積は１００万円です")).toEqual(["100"]);
    expect(extractAmounts("価格は￥１２０００")).toEqual(["12000"]);
    expect(normalizeCorrespondenceBody("１２３")).toBe("123");
  });

  it("assertFulfillmentLanguage catches spaced obfuscation", () => {
    expect(() => assertFulfillmentLanguage("在 庫 は十分です。", [])).toThrow(
      /inventory claim/,
    );
    expect(() => assertFulfillmentLanguage("出荷可能です。", [])).toThrow(/inventory/);
  });

  it("assertOutboundSlackDraft gates amounts and fulfillment without recipient registry", () => {
    expect(() =>
      assertOutboundSlackDraft({
        channel: "slack",
        slack_channel: "#sales-alerts",
        body: "在庫あり。",
        attachment_refs: [],
      }),
    ).toThrow(/inventory claim/);

    expect(() =>
      assertOutboundSlackDraft({
        channel: "slack",
        slack_channel: "#sales-alerts",
        body: "見積 50万円",
        attachment_refs: [],
      }),
    ).toThrow(/amount claim|金額/);

    const claims: CorrespondenceClaim[] = [
      {
        id: "a1",
        kind: "amount",
        label: "band",
        value: "50-60",
        source: "deal",
        verified: true,
      },
    ];
    expect(() =>
      assertOutboundCorrespondenceDraft({
        channel: "slack",
        slack_channel: "#ops",
        body: "見積 50万円",
        notes: `claims-json:${JSON.stringify(claims)}`,
        attachment_refs: [],
      }),
    ).not.toThrow();
  });

  it("createCorrespondenceDraft applies OOO to slack and records audit on rejection", () => {
    expect(() =>
      createCorrespondenceDraft({
        channel: "slack",
        slackChannel: "#alerts",
        body: "納期は来週です。",
        createdBy: "secretary",
        proposeApproval: false,
      }),
    ).toThrow(/delivery claim/);

    const events = listAuditEvents().filter((e) => e.event === "correspondence_gate");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.detail).toMatch(/fulfillment:slack/);
  });

  it("createCorrespondenceDraft allows clean slack body", () => {
    const { draft } = createCorrespondenceDraft({
      channel: "slack",
      slackChannel: "#general",
      body: "案件 INQ-1 を triage しました。",
      createdBy: "secretary",
      proposeApproval: false,
    });
    expect(draft.channel).toBe("slack");
    expect(loadCorrespondenceDraft(draft.draft_id).slack_channel).toBe("#general");
  });

  it("recordCorrespondenceGateRejection writes L1 audit row", () => {
    recordCorrespondenceGateRejection({
      gate: "amount",
      channel: "email",
      ref: "DRAFT-test",
      actor: "OP-001",
      reason: "本文に金額があります",
    });
    const row = listAuditEvents().find(
      (e) => e.event === "correspondence_gate" && e.ref === "DRAFT-test",
    );
    expect(row?.ref).toBe("DRAFT-test");
    expect(row?.detail).toMatch(/^amount:email:/);
    expect(row?.detail).not.toMatch(/@|口座/);
  });
});
