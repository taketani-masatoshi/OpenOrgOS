import { describe, expect, it } from "vitest";
import { redactWireConsoleValue } from "../src/lib/wire-console/redact.js";

describe("wire console L2 redaction", () => {
  it("redacts mobile numbers in envelope payloads", () => {
    const redacted = redactWireConsoleValue({
      event: {
        payload: {
          notes: "contact 090-1234-5678 for ops",
        },
      },
    }) as { event: { payload: { notes: string } } };

    expect(redacted.event.payload.notes).toContain("[REDACTED-L2]");
    expect(redacted.event.payload.notes).not.toContain("090-1234-5678");
  });

  it("redacts L2 patterns in snapshot validation messages", () => {
    const redacted = redactWireConsoleValue({
      tenant_id: "demo",
      validation: {
        ok: false,
        issues: [{ code: "x", message: "leak 090-1234-5678 in validate" }],
        warnings: [],
      },
      counts: { outbox: 0, inbox: 0, transactions: 0, wire_pending: 0, witness_pending: 0 },
    }) as { validation: { issues: { message: string }[] } };

    expect(redacted.validation.issues[0]!.message).toContain("[REDACTED-L2]");
    expect(redacted.validation.issues[0]!.message).not.toContain("090-1234-5678");
  });
});
