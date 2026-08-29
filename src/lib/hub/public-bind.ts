/**
 * Witness Hub public-bind TLS gate.
 * Loopback plaintext stays allowed; 0.0.0.0 without TLS is blocked when opted in.
 */

export function isHubPublicMode(): boolean {
  return process.env.ORGOS_HUB_PUBLIC === "1";
}

export function hubPublicTlsRequired(): boolean {
  return process.env.ORGOS_HUB_REQUIRE_TLS === "1" || isHubPublicMode();
}

export function isHubPublicBindHost(host?: string): boolean {
  const h = (host ?? "127.0.0.1").trim().toLowerCase();
  return h === "0.0.0.0" || h === "::" || h === "[::]" || h === "*";
}

export function assertHubPublicBindAllowed(opts: {
  host?: string;
  tlsCert?: string;
  tlsKey?: string;
}): void {
  if (!hubPublicTlsRequired()) return;
  const hasTls = Boolean(opts.tlsCert?.trim() && opts.tlsKey?.trim());
  if (isHubPublicBindHost(opts.host) && !hasTls) {
    throw new Error(
      "Public Hub bind requires TLS (pass --tls-cert and --tls-key, or unset ORGOS_HUB_REQUIRE_TLS / ORGOS_HUB_PUBLIC)",
    );
  }
}
