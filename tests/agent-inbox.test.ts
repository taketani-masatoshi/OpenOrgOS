import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ackAgentInboxItem,
  buildAgentInbox,
  formatAgentInboxMarkdown,
  readAgentSummaryBody,
} from "../src/lib/agent-inbox.js";
import {
  ackRelay,
  createAgentOrder,
  missionsDir,
  submitAgentReport,
} from "../src/lib/agent-reporting.js";
import { completeWorkOrder, runEscalation } from "../src/lib/escalate.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDocsReportsDir } from "../src/lib/utils.js";

describe("agent inbox", () => {
  beforeEach(() => {
    setTenantId("mal");
    const dir = missionsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    const dir = missionsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("builds unread answers and pending orders with WO status join", () => {
    const order = createAgentOrder({
      toAgent: "finance",
      subject: "月次資金確認",
      fromActor: "executive_steward",
    });
    expect(buildAgentInbox().pending_orders.some((i) => i.mission_id === order.id)).toBe(true);

    submitAgentReport({
      agentId: "finance",
      missionId: order.id,
      summary: "残高は基準内です。追加資金は不要。",
      autoForward: true,
    });

    const snap = buildAgentInbox({ for: "executive_steward" });
    expect(snap.unread_count).toBeGreaterThan(0);
    const item = snap.items.find((i) => i.mission_id === order.id);
    expect(item).toBeDefined();
    expect(item!.unread).toBe(true);
    expect(item!.summary).toContain("残高");
    expect(item!.agent_label.length).toBeGreaterThan(0);
    expect(snap.pending_orders.some((i) => i.mission_id === order.id)).toBe(false);
  });

  it("filters secretary scope by from_actor", () => {
    createAgentOrder({
      toAgent: "operations",
      subject: "秘書起票",
      fromActor: "secretary",
    });
    createAgentOrder({
      toAgent: "finance",
      subject: "スチュワード起票",
      fromActor: "executive_steward",
    });

    const secretary = buildAgentInbox({ for: "secretary" });
    expect(secretary.pending_orders.every((i) => i.subject === "秘書起票")).toBe(true);
    expect(secretary.pending_orders.length).toBe(1);

    const steward = buildAgentInbox({ for: "executive_steward" });
    expect(steward.pending_orders.length).toBeGreaterThanOrEqual(2);
  });

  it("joins work order status from escalate complete", () => {
    const result = runEscalation({
      fromAgent: "executive_steward",
      input: {
        subject: "inbox WO join",
        requirements: "classification-registry 確認",
        path: "data/classification-registry.yaml",
        tenant: "mal",
      },
    });
    const child = result.workOrders.find((w) => w.to_agent !== "executive_steward");
    expect(child).toBeDefined();

    completeWorkOrder(child!.id, "完了メモ");
    const snap = buildAgentInbox();
    const item = snap.items.find((i) => i.work_order_id === child!.id);
    expect(item).toBeDefined();
    expect(item!.work_order_status).toBe("completed");
    expect(item!.unread).toBe(true);
  });

  it("skips corrupt mission YAML when skipInvalid is used via buildAgentInbox", () => {
    const dir = missionsDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "MS-20990101-999.yaml"), "not: valid: mission\n", "utf-8");

    createAgentOrder({
      toAgent: "compliance",
      subject: "正常案件",
      fromActor: "executive_steward",
    });

    expect(() => buildAgentInbox()).not.toThrow();
    const snap = buildAgentInbox();
    expect(snap.pending_orders.some((i) => i.subject === "正常案件")).toBe(true);
  });

  it("clips summaries in markdown digest", () => {
    const long = "あ".repeat(500);
    const order = createAgentOrder({
      toAgent: "finance",
      subject: "長文要約",
      fromActor: "executive_steward",
    });
    submitAgentReport({
      agentId: "finance",
      missionId: order.id,
      summary: long,
      autoForward: true,
    });
    const md = formatAgentInboxMarkdown(buildAgentInbox(), { limit: 8, summaryMaxChars: 80 });
    expect(md).toContain("Agent inbox");
    expect(md).toContain("未読");
    expect(md).toMatch(/…/);
    expect(md.length).toBeLessThan(long.length + 400);
  });

  it("acks steward inbox items", () => {
    const order = createAgentOrder({
      toAgent: "operations",
      subject: "ack テスト",
      fromActor: "executive_steward",
    });
    submitAgentReport({
      agentId: "operations",
      missionId: order.id,
      summary: "完了",
      autoForward: true,
    });
    const before = buildAgentInbox();
    expect(before.unread_count).toBeGreaterThan(0);

    const acked = ackAgentInboxItem(order.id, "確認済");
    expect(acked.unread).toBe(false);
    expect(acked.relay_steward).toBe("ack");
    expect(buildAgentInbox().items.find((i) => i.mission_id === order.id)?.unread).toBe(false);
  });

  it("reads summary bodies only under allowed prefixes and rejects traversal", () => {
    const summaries = join(getDocsReportsDir(), "agent-summaries", "finance");
    mkdirSync(summaries, { recursive: true });
    const file = join(summaries, "2099-01-01-inbox-test.md");
    writeFileSync(file, "# Finance test\n\nOK\n", "utf-8");

    const body = readAgentSummaryBody("docs/reports/agent-summaries/finance/2099-01-01-inbox-test.md");
    expect(body).toContain("Finance test");

    expect(() => readAgentSummaryBody("../../package.json")).toThrow(/must not contain \.\./);
    expect(() => readAgentSummaryBody("docs/reports/executive-notes/secret.md")).toThrow(
      /must be under/
    );

    if (existsSync(file)) rmSync(file, { force: true });
  });

  it("ackRelay already-acked throws and is surfaced by ackAgentInboxItem", () => {
    const order = createAgentOrder({
      toAgent: "finance",
      subject: "二重 ack",
      fromActor: "executive_steward",
    });
    submitAgentReport({
      agentId: "finance",
      missionId: order.id,
      summary: "done",
      autoForward: true,
    });
    ackRelay({ missionId: order.id, role: "steward" });
    expect(() => ackAgentInboxItem(order.id)).toThrow(/already/);
  });
});
