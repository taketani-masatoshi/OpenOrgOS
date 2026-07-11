import type { ContactLookupMatch } from "../secretary/contact-registry.js";
import { resolveSenderByEmail } from "../secretary/contact-registry.js";
import {
  extractDisplayName,
  extractEmailAddress,
  isInternalEmailDomain,
} from "./internal-domains.js";

export type SenderScope = "external" | "internal" | "peer";

export interface ResolvedMailSender {
  email: string;
  displayName?: string;
  known: boolean;
  internalDomain: boolean;
  scope?: SenderScope;
  contactRef?: string;
  match?: ContactLookupMatch;
  ambiguous?: boolean;
}

function scopeFromMatch(match: ContactLookupMatch): SenderScope {
  if (match.scope === "self") return "internal";
  if (match.scope === "peer_tenant") return "peer";
  return "external";
}

export function resolveMailSender(fromHeader: string): ResolvedMailSender {
  const email = extractEmailAddress(fromHeader);
  const displayName = extractDisplayName(fromHeader);
  const internalDomain = isInternalEmailDomain(email);
  const resolution = resolveSenderByEmail(email, displayName);

  if (resolution.known && resolution.match) {
    return {
      email,
      displayName,
      known: true,
      internalDomain,
      scope: scopeFromMatch(resolution.match),
      contactRef: `${resolution.match.source}#${resolution.match.ref}`,
      match: resolution.match,
      ambiguous: resolution.ambiguous,
    };
  }

  return {
    email,
    displayName,
    known: false,
    internalDomain,
    scope: internalDomain ? "internal" : "external",
  };
}
