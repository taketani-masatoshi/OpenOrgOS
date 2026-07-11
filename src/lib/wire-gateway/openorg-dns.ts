import { resolveSrv, resolveTxt } from "node:dns/promises";
import {
  OPENORG_WIRE_SRV_SERVICE,
  OPENORG_WIRE_TXT_PREFIX,
  type OpenOrgDnsResolveResult,
  type OpenOrgDnsSource,
} from "../../../schemas/protocol/openorg-dns.js";
import { wireNodeWellKnownSchema } from "../../../schemas/protocol/wire-message.js";
import { resolveWireTrustNode } from "../protocol/wire-trust-registry.js";

export interface OpenOrgDnsResolver {
  resolveSrv(name: string): Promise<Array<{ name: string; port: number; priority?: number }>>;
  resolveTxt(name: string): Promise<string[][]>;
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

const defaultResolver: OpenOrgDnsResolver = {
  resolveSrv: async (name) => {
    const records = await resolveSrv(name);
    return records.map((r) => ({ name: r.name, port: r.port, priority: r.priority }));
  },
  resolveTxt: async (name) => resolveTxt(name),
  fetch: (url, init) => fetch(url, init),
};

/** True when node_id looks like a DNS-style FQDN (contains a dot, not a URI/DID). */
export function isDnsStyleNodeId(nodeId: string): boolean {
  const trimmed = nodeId.trim();
  if (!trimmed.includes(".")) return false;
  if (trimmed.startsWith("steward://")) return false;
  if (trimmed.startsWith("did:")) return false;
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(trimmed);
}

function wireUrlFromSrv(records: Array<{ name: string; port: number; priority?: number }>): string | undefined {
  if (!records.length) return undefined;
  const sorted = [...records].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const pick = sorted[0]!;
  const host = pick.name.replace(/\.$/, "");
  const scheme = pick.port === 443 ? "https" : "http";
  return `${scheme}://${host}${pick.port === 443 || pick.port === 80 ? "" : `:${pick.port}`}`;
}

function wireUrlFromTxt(records: string[][]): string | undefined {
  for (const row of records) {
    for (const chunk of row) {
      const trimmed = chunk.trim();
      if (trimmed.startsWith(OPENORG_WIRE_TXT_PREFIX)) {
        const url = trimmed.slice(OPENORG_WIRE_TXT_PREFIX.length).trim();
        if (url.startsWith("http://") || url.startsWith("https://")) return url.replace(/\/$/, "");
      }
    }
  }
  return undefined;
}

async function fetchWellKnownWireUrl(
  baseUrl: string,
  resolver: OpenOrgDnsResolver
): Promise<string | undefined> {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/.well-known/wire-node.json`;
  try {
    const res = await resolver.fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return undefined;
    const body = wireNodeWellKnownSchema.safeParse(await res.json());
    if (!body.success) return undefined;
    const push = body.data.endpoints.events_push;
    return push.replace(/\/wire\/v1\/events\/?$/, "");
  } catch {
    return undefined;
  }
}

function result(
  nodeId: string,
  source: OpenOrgDnsSource,
  wireUrl?: string,
  detail?: string
): OpenOrgDnsResolveResult {
  return { node_id: nodeId, wire_url: wireUrl, source, detail };
}

/**
 * Resolve DNS-style node_id → wire base URL.
 * Order: trust-registry → DNS SRV → DNS TXT → HTTPS well-known (wire.{domain} then apex).
 */
export async function resolveOpenOrgWireUrl(
  nodeId: string,
  opts?: { resolver?: OpenOrgDnsResolver }
): Promise<OpenOrgDnsResolveResult> {
  const resolver = opts?.resolver ?? defaultResolver;
  const trimmed = nodeId.trim();

  const trust = resolveWireTrustNode(trimmed);
  if (trust?.node.wire_url) {
    return result(trimmed, "trust-registry", trust.node.wire_url.replace(/\/$/, ""));
  }

  if (!isDnsStyleNodeId(trimmed)) {
    return result(trimmed, "unresolved", undefined, "not a DNS-style node_id");
  }

  const domain = trimmed.toLowerCase();

  try {
    const srvName = `${OPENORG_WIRE_SRV_SERVICE}.${domain}`;
    const srvRecords = await resolver.resolveSrv(srvName);
    const srvUrl = wireUrlFromSrv(srvRecords);
    if (srvUrl) return result(trimmed, "dns-srv", srvUrl);
  } catch {
    /* NXDOMAIN etc. */
  }

  try {
    const txtRecords = await resolver.resolveTxt(`_openorgos-wire.${domain}`);
    const txtUrl = wireUrlFromTxt(txtRecords);
    if (txtUrl) return result(trimmed, "dns-txt", txtUrl);
  } catch {
    /* optional */
  }

  const wellKnownCandidates = [
    `https://wire.${domain}`,
    `https://${domain}`,
  ];
  for (const candidate of wellKnownCandidates) {
    const url = await fetchWellKnownWireUrl(candidate, resolver);
    if (url) return result(trimmed, "well-known", url, candidate);
  }

  return result(trimmed, "unresolved", undefined, "no SRV/TXT/well-known match");
}

/** Build DNS TXT hint line for operator publish (OpenOrg DNS). */
export function formatOpenOrgWireDnsTxt(wireUrl: string): string {
  return `${OPENORG_WIRE_TXT_PREFIX}${wireUrl.replace(/\/$/, "")}`;
}
