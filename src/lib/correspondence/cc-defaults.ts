import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getDataDir } from "../utils.js";
import { loadMailConfig, resolveMailConfig } from "./mail-config.js";

function loadCompanyPublicDisclosure(): {
  contact_email?: string;
  representative_email?: string;
  correspondence_cc?: string[];
} | null {
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return null;
  try {
    const doc = YAML.parse(readFileSync(path, "utf-8")) as {
      public_disclosure?: {
        contact_email?: string;
        representative_email?: string;
        correspondence_cc?: string[];
      };
    };
    return doc.public_disclosure ?? null;
  } catch {
    return null;
  }
}

function parseCcList(cc?: string): string[] {
  if (!cc?.trim()) return [];
  return cc
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function shouldIncludeCc(
  email: string,
  opts: { fromEmail: string; toEmail?: string; seen: Set<string> }
): boolean {
  const norm = normalizeEmail(email);
  if (!norm || opts.seen.has(norm)) return false;
  if (norm === opts.fromEmail) return false;
  if (opts.toEmail && norm === opts.toEmail) return false;
  return true;
}

export interface ResolveDefaultCorrespondenceCcOptions {
  to?: string;
  explicitCc?: string;
  /** CLI --no-cc-defaults */
  skipDefaults?: boolean;
}

export interface ResolveDefaultCorrespondenceCcResult {
  cc: string | undefined;
  appliedDefaults: string[];
}

/**
 * Secretary 送信元（mail-config.from）で外部へ送るとき、CEO 等の oversight CC を既定付与。
 * 正本: mail-config outbound.cc_defaults → company.yaml contact_email / correspondence_cc
 */
export function resolveDefaultCorrespondenceCc(
  opts: ResolveDefaultCorrespondenceCcOptions
): ResolveDefaultCorrespondenceCcResult {
  const explicit = parseCcList(opts.explicitCc);
  const seen = new Set(explicit.map(normalizeEmail));
  const applied: string[] = [];
  const merged = [...explicit];

  if (opts.skipDefaults) {
    return { cc: merged.length ? merged.join(", ") : undefined, appliedDefaults: [] };
  }

  const fromEmail = normalizeEmail(resolveMailConfig().from.email);
  const toEmail = opts.to ? normalizeEmail(opts.to) : undefined;
  const fileConfig = loadMailConfig();
  const disclosure = loadCompanyPublicDisclosure();

  const candidates: { email: string; source: string }[] = [];

  for (const entry of fileConfig?.outbound?.cc_defaults ?? []) {
    candidates.push({ email: entry.email, source: `mail-config:${entry.role ?? "default"}` });
  }

  for (const email of disclosure?.correspondence_cc ?? []) {
    candidates.push({ email, source: "company.correspondence_cc" });
  }

  if (disclosure?.contact_email) {
    candidates.push({ email: disclosure.contact_email, source: "company.contact_email" });
  }

  if (disclosure?.representative_email) {
    candidates.push({
      email: disclosure.representative_email,
      source: "company.representative_email",
    });
  }

  for (const { email, source } of candidates) {
    if (!shouldIncludeCc(email, { fromEmail, toEmail, seen })) continue;
    seen.add(normalizeEmail(email));
    merged.push(email);
    applied.push(source);
  }

  return {
    cc: merged.length ? merged.join(", ") : undefined,
    appliedDefaults: applied,
  };
}
