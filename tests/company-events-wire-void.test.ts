import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
  loadCompanyEvents,
  saveCompanyEvents,
  voidCompanyEvent,
} from "../src/lib/company-events.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { markWireDelivered } from "../src/lib/protocol/wire-delivered.js";
import {
  assertCanVoidCompanyEvent,
  getCompanyEventWireStatus,
  proposeVoidWireForCompanyEvent,
  registerCompanyEventVoidAck,
} from "../src/lib/company-events-wire.js";
import {
  approveInterOrgNotice,
  proposeInterOrgWire,
} from "../src/lib/wire/notice-workflow.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "protocol"),
    join(getDataDir(), "org"),
    join(getDataDir(), "company-events.yaml"),
    join(getDataDir(), "company-events-chain.jsonl"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("company-events wire void gate", () => {
  let eventId = "";

  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    initCompanyEventsFile();
    ensureCompanyEventMonth("2026-07");

    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-200.yaml"),
      `id: CTR-200
name: Wire-linked service
counterparty: Peer Co
type: outsourcing
status: executed
start_date: "2026-07-01"
executed_date: "2026-07-01"
monthly_cost: 50000
`,
      "utf-8"
    );

    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer Co",
      jurisdiction: "JP",
    });

    const event = createCompanyEvent({
      kind: "contract",
      title: "Wire linked contract event",
      occurredAt: "2026-07-05",
      slug: "wire-linked",
      related: { contract_id: "CTR-200" },
    });
    eventId = event.id;
  });

  afterEach(() => cleanup());

  it("allows void when no wire exposure exists", () => {
    expect(() => assertCanVoidCompanyEvent(loadCompanyEvents().events[0]!)).not.toThrow();
    const { target } = voidCompanyEvent(eventId, "test correction");
    expect(target.status).toBe("voided");
  });

  it("blocks void for wire-delivered exposure until void ack is registered", () => {
    const wireEventId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const registry = loadCompanyEvents();
    registry.events[0] = {
      ...registry.events[0]!,
      wire_binding: {
        peer_id: "PEER-001",
        wire_event_id: wireEventId,
        status: "delivered",
      },
    };
    saveCompanyEvents(registry);
    markWireDelivered("PEER-001", wireEventId);

    expect(() => assertCanVoidCompanyEvent(registry.events[0]!)).toThrow(/void acknowledgment/);
    const status = getCompanyEventWireStatus(eventId);
    expect(status.void_blocked).toBe(true);
    expect(status.exposures[0]?.wire_event_id).toBe(wireEventId);
  });

  it("void-request → void-ack → void succeeds", () => {
    const wireEventId = "bbbbbbbb-bbbb-4ccc-dddd-ffffffffffff";
    const registry = loadCompanyEvents();
    registry.events[0] = {
      ...registry.events[0]!,
      wire_binding: {
        peer_id: "PEER-001",
        wire_event_id: wireEventId,
        status: "delivered",
      },
    };
    saveCompanyEvents(registry);
    markWireDelivered("PEER-001", wireEventId);

    const notice = proposeVoidWireForCompanyEvent({
      companyEventId: eventId,
      proposedBy: "ops-user",
    });
    expect(notice.transaction_type).toBe("contract.void.requested");
    expect(notice.correlation_event_id).toBe(wireEventId);

    registerCompanyEventVoidAck({
      companyEventId: eventId,
      wireEventId: "cccccccc-cccc-4ccc-dddd-111111111111",
      peerId: "PEER-001",
    });

    expect(() => assertCanVoidCompanyEvent(loadCompanyEvents().events[0]!)).not.toThrow();
    const { target } = voidCompanyEvent(eventId, "peer acknowledged void");
    expect(target.status).toBe("voided");
  });

  it("syncs wire_binding when notice with company_event is approved", () => {
    const notice = proposeInterOrgWire({
      peerId: "PEER-001",
      transactionType: "contract.execution.notice",
      contractId: "CTR-200",
      proposedBy: "ops-user",
      companyEventId: eventId,
    });

    approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "CEO Sample",
    });

    const updated = loadCompanyEvents().events.find((e) => e.id === eventId);
    expect(updated?.wire_binding?.status).toBe("delivered");
    expect(updated?.wire_binding?.peer_id).toBe("PEER-001");
    expect(updated?.wire_binding?.wire_event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    expect(() => assertCanVoidCompanyEvent(updated!)).toThrow(/void acknowledgment/);
  });
});
