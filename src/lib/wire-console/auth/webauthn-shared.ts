export function rpId(): string {
  return process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID ?? "127.0.0.1";
}
