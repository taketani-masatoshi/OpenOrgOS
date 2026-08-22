export function rpId(): string {
  return process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID ?? "localhost";
}

/** Deprecated help-host RP id — ceremony uses `rpId()` (console). */
export function settlementRpId(): string {
  const fromEnv = process.env.ORGOS_SETTLEMENT_RP_ID?.trim();
  if (fromEnv) return fromEnv;
  const origin = process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN?.trim();
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      return origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  }
  return "approve.oorgos.org";
}
