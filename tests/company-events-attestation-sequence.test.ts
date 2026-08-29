import { describe, expect, it } from "vitest";
import type { CompanyEventsAttestation } from "../schemas/company-events-attestation.js";
import { verifyAttestationSequence } from "../src/lib/company-events-attestation.js";

function att(partial: Partial<CompanyEventsAttestation> & Pick<CompanyEventsAttestation, "attestation_id">): CompanyEventsAttestation {
  return {
    attestation_type: "weekly_batch",
    period_start: "2026-08-18",
    period_end: "2026-08-24",
    chain_verified_at: "2026-08-24T00:00:00.000Z",
    chain_ok: true,
    chain_checked: 4,
    chain_tail_seq: partial.chain_tail_seq ?? 4,
    chain_tail_digest: "abc",
    chain_tail_link_id: "CEL-4",
    links_since_prev: partial.links_since_prev ?? 0,
    registry_event_count: 4,
    payload_digest: "deadbeef",
    signature: "sig",
    public_key: "pk",
    signed_at: partial.signed_at ?? "2026-08-24T00:00:00.000Z",
    ...partial,
  };
}

describe("verifyAttestationSequence", () => {
  it("passes for valid prev chain", () => {
    const first = att({
      attestation_id: "CEA-2026-W34",
      signed_at: "2026-08-18T00:00:00.000Z",
      chain_tail_seq: 4,
      links_since_prev: 4,
    });
    const second = att({
      attestation_id: "CEA-2026-W35",
      signed_at: "2026-08-25T00:00:00.000Z",
      chain_tail_seq: 4,
      links_since_prev: 0,
      prev_attestation_id: "CEA-2026-W34",
    });
    expect(verifyAttestationSequence([first, second])).toEqual([]);
  });

  it("detects orphan prev and tail regression", () => {
    const bad = att({
      attestation_id: "CEA-2026-W36",
      prev_attestation_id: "CEA-missing",
      chain_tail_seq: 2,
      links_since_prev: 1,
      signed_at: "2026-09-01T00:00:00.000Z",
    });
    const prev = att({
      attestation_id: "CEA-2026-W35",
      chain_tail_seq: 4,
      signed_at: "2026-08-25T00:00:00.000Z",
    });
    const issues = verifyAttestationSequence([prev, bad]);
    expect(issues.some((i) => i.code === "attestation-prev-orphan")).toBe(true);
  });

  it("detects prev fork", () => {
    const prev = att({ attestation_id: "CEA-A", signed_at: "2026-08-01T00:00:00.000Z" });
    const b1 = att({
      attestation_id: "CEA-B1",
      prev_attestation_id: "CEA-A",
      signed_at: "2026-08-08T00:00:00.000Z",
    });
    const b2 = att({
      attestation_id: "CEA-B2",
      prev_attestation_id: "CEA-A",
      signed_at: "2026-08-09T00:00:00.000Z",
    });
    expect(verifyAttestationSequence([prev, b1, b2]).some((i) => i.code === "attestation-prev-fork")).toBe(true);
  });
});
