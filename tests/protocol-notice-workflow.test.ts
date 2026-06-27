import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  proposeInterOrgNotice,
  proposeInterOrgAck,
  approveInterOrgNotice,
  rejectInterOrgNotice,
  listPendingNotices,
} from "../src/lib/protocol/notice-workflow.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "protocol"),
    join(getDataDir(), "org"),
    join(getDocsDir(), "protocol"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("inter-org operator notice workflow", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Office lease
counterparty: Peer Co
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 85000
`,
      "utf-8"
    );
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer Co",
      jurisdiction: "JP",
    });
  });

  afterEach(() => cleanup());

  it("blocks outbound wire without operator attestation", () => {
    expect(() =>
      recordProtocolTransaction({
        transactionType: "invoice.issued",
        peerId: "PEER-001",
        direction: "outbound",
      })
    ).toThrow(/operator approval/);
  });

  it("propose → approve transmits execution notice with attestation", () => {
    const notice = proposeInterOrgNotice({
      peerId: "PEER-001",
      contractId: "CTR-099",
      proposedBy: "ops-user",
    });
    expect(notice.status).toBe("pending_approval");

    const { transmission, notice: done } = approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "CEO Sample",
    });

    expect(done.status).toBe("transmitted");
    expect(done.approval_tier).toBe("A");
    expect(transmission.transaction.transaction_type).toBe("contract.execution.notice");
    const payload = transmission.envelope.event.payload;
    expect(payload.notice_kind).toBe("per_existing_contract");
    expect(payload.operator_attestation).toMatchObject({
      approver_id: "CEO Sample",
      basis: "existing_contract",
      approval_tier: "A",
    });
  });

  it("ack notice propose → approve uses correlation event", () => {
    const ackDraft = proposeInterOrgAck({
      peerId: "PEER-001",
      proposedBy: "ops-user",
      correlationEventId: "33333333-3333-4333-8333-333333333333",
      contractId: "CTR-099",
    });
    expect(ackDraft.transaction_type).toBe("obligation.acknowledged");

    const { transmission } = approveInterOrgNotice({
      noticeId: ackDraft.notice_id,
      approverId: "CEO Sample",
    });
    expect(transmission.transaction.transaction_type).toBe("obligation.acknowledged");
  });

  it("rejects pending notice", () => {
    const notice = proposeInterOrgNotice({
      peerId: "PEER-001",
      contractId: "CTR-099",
      proposedBy: "ops-user",
    });
    const rejected = rejectInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "CEO Sample",
      reason: "timing",
    });
    expect(rejected.status).toBe("rejected");
    expect(listPendingNotices({ status: "pending_approval" }).length).toBe(0);
  });

  it("requires executed contract before propose", () => {
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-100.yaml"),
      `id: CTR-100
name: Draft
counterparty: X
type: rental
status: draft
start_date: "2026-01-01"
`,
      "utf-8"
    );
    expect(() =>
      proposeInterOrgNotice({
        peerId: "PEER-001",
        contractId: "CTR-100",
        proposedBy: "ops",
      })
    ).toThrow(/executed/);
  });
});
