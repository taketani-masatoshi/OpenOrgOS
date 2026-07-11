import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getDataDir } from "../utils.js";

function domainFromEmail(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at < 0) return undefined;
  return email.slice(at + 1).trim().toLowerCase();
}

/** L1 — company.yaml から自社ドメイン一覧を抽出 */
export function loadInternalEmailDomains(): string[] {
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return [];
  const doc = YAML.parse(readFileSync(path, "utf-8")) as {
    public_disclosure?: {
      representative_email?: string;
      contact_email?: string;
      correspondence_cc?: string[] | string;
      internal_domains?: string[];
    };
    internal_domains?: string[];
  };

  const domains = new Set<string>();
  const pd = doc.public_disclosure;
  for (const addr of [
    pd?.representative_email,
    pd?.contact_email,
    ...(Array.isArray(pd?.correspondence_cc)
      ? pd.correspondence_cc
      : pd?.correspondence_cc
        ? [pd.correspondence_cc]
        : []),
  ]) {
    const d = addr ? domainFromEmail(addr) : undefined;
    if (d) domains.add(d);
  }
  for (const d of doc.internal_domains ?? pd?.internal_domains ?? []) {
    domains.add(d.toLowerCase());
  }
  return [...domains];
}

export function isInternalEmailDomain(email: string): boolean {
  const domain = domainFromEmail(email);
  if (!domain) return false;
  return loadInternalEmailDomains().some(
    (d) => domain === d || domain.endsWith(`.${d}`)
  );
}

export function extractEmailAddress(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  return (m?.[1] ?? fromHeader).trim().toLowerCase();
}

export function extractDisplayName(fromHeader: string): string | undefined {
  const m = fromHeader.match(/^"?([^"<]+)"?\s*</);
  if (m?.[1]) return m[1].trim();
  if (!fromHeader.includes("@")) return fromHeader.trim();
  return undefined;
}
