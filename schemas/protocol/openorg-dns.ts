import { z } from "zod";

/** Resolution source for OpenOrg DNS wire URL lookup. */
export const openOrgDnsSourceSchema = z.enum([
  "trust-registry",
  "dns-srv",
  "dns-txt",
  "well-known",
  "unresolved",
]);

export type OpenOrgDnsSource = z.output<typeof openOrgDnsSourceSchema>;

export const openOrgDnsResolveResultSchema = z.object({
  node_id: z.string().min(1),
  wire_url: z.string().url().optional(),
  source: openOrgDnsSourceSchema,
  detail: z.string().optional(),
});

export type OpenOrgDnsResolveResult = z.output<typeof openOrgDnsResolveResultSchema>;

/** DNS SRV service name for Wire Gateway (RFC 2782 style). */
export const OPENORG_WIRE_SRV_SERVICE = "_openorgos-wire._tcp";

/** DNS TXT record prefix for wire URL hints. */
export const OPENORG_WIRE_TXT_PREFIX = "wire-url=";
