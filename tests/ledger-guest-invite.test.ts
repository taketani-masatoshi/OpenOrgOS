import { describe, expect, it } from "vitest";
import {
  buildGuestSetupSnapshot,
  createGuestInviteToken,
  resolveGuestInviteToken,
} from "../src/lib/product/ledger-guest-invite.js";
import { assertGuestInviteLoginRegistration } from "../src/lib/wire-console/auth/webauthn-register-gate.js";

describe("ledger guest invite", () => {
  it("creates and resolves a guest invite token", () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const { token } = createGuestInviteToken({
      tenantId: "pilot-ledger-001",
      email: "guest@example.com",
      operatorId: "OP-GUEST01",
      expiresAt,
    });
    const resolved = resolveGuestInviteToken(token);
    expect(resolved?.valid).toBe(true);
    expect(resolved?.operator_id).toBe("OP-GUEST01");

    const snapshot = buildGuestSetupSnapshot(token);
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.email).toBe("guest@example.com");
    }

    const gate = assertGuestInviteLoginRegistration(token, "OP-GUEST01");
    expect(gate).toBeNull();
  });
});
