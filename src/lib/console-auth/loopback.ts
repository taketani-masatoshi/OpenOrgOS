/** Loopback / bind helpers for zero-trust local surfaces. */

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "127.0.0.1" ||
    h === "localhost" ||
    h === "::1" ||
    h === "0.0.0.0" || // bind-all is not loopback exposure by itself; treated separately
    h.startsWith("127.")
  );
}

/** True when the bind address is loopback-only (not all interfaces). */
export function isLoopbackOnlyBind(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h.startsWith("127.");
}

export function isRemoteSocketAddress(address: string | undefined): boolean {
  if (!address) return true;
  const a = address.trim().toLowerCase().replace(/^::ffff:/, "");
  return !(
    a === "127.0.0.1" ||
    a === "::1" ||
    a === "localhost" ||
    a.startsWith("127.")
  );
}
