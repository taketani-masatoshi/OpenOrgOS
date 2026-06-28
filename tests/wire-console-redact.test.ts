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
});
