import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { loadExternalContacts } from "../data.js";
import { getJurisdictionPackRoot, resolveJurisdictionCode } from "../jurisdiction.js";
import { loadTenantConfig } from "../tenant.js";
import { getInstallRoot } from "../orgos-paths.js";

const correspondenceStyleSchema = z.object({
  locale: z.string().min(1),
  formality: z.string().optional(),
  language: z.string().optional(),
  self_reference: z
    .object({
      first_mention: z.string().optional(),
      later: z.array(z.string()).default([]),
      banned_first_mention_patterns: z.array(z.string()).default([]),
    })
    .partial()
    .passthrough()
    .optional(),
  other_reference: z
    .object({
      organization: z.string().optional(),
      person_suffix: z.string().optional(),
      organization_only_suffix: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  opener: z
    .object({
      standard: z.string().optional(),
      reply_thanks: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  closings: z
    .object({
      request: z.string().optional(),
      confirm: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  signature: z
    .object({
      default: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  forbidden_phrases: z.array(z.string()).default([]),
  speculation_banned: z.boolean().optional(),
  required_blocks: z.record(z.string(), z.array(z.string())).optional(),
  in_person_venue: z.record(z.string(), z.unknown()).optional(),
  cost: z
    .object({
      propose_from_host_when_meal: z.boolean().optional(),
      phrase_example: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
});

export type CorrespondenceStyle = z.output<typeof correspondenceStyleSchema>;

const LOCALE_TO_PACK: Record<string, string> = {
  "ja-JP": "JP",
  ja: "JP",
  "en-US": "US",
  en: "US",
};

const FALLBACK_STYLE: CorrespondenceStyle = {
  locale: "neutral",
  forbidden_phrases: ["送信元:", "送信元：", "グループ会社", "予算相談しやすい"],
  opener: { standard: "", reply_thanks: "Thank you for your reply." },
  closings: { request: "Best regards,", confirm: "Best regards," },
  signature: { default: "{company}" },
  self_reference: { first_mention: "{company} secretary." },
  other_reference: { person_suffix: "", organization: "your organization" },
};

export function packCodeForLocale(locale: string): string | undefined {
  return LOCALE_TO_PACK[locale] ?? LOCALE_TO_PACK[locale.split("-")[0] ?? ""];
}

export function resolveCorrespondenceLocale(opts?: {
  contactRef?: string;
  email?: string;
  explicit?: string;
}): string {
  if (opts?.explicit?.trim()) return opts.explicit.trim();

  try {
    const contacts = loadExternalContacts().contacts;
    const hit = contacts.find((c) => {
      if (opts?.contactRef && c.id === opts.contactRef) return true;
      if (opts?.email && c.email?.toLowerCase() === opts.email.toLowerCase()) return true;
      return false;
    });
    if (hit?.correspondence_locale?.trim()) return hit.correspondence_locale.trim();
  } catch {
    /* contacts optional in some fixtures */
  }

  try {
    const tenant = loadTenantConfig();
    if (tenant.locale?.trim()) return tenant.locale.trim();
    if (tenant.jurisdiction === "US") return "en-US";
    if (tenant.jurisdiction === "JP") return "ja-JP";
  } catch {
    /* ignore */
  }

  return "ja-JP";
}

export function correspondenceStylePath(locale: string): string | undefined {
  const pack = packCodeForLocale(locale);
  if (!pack) return undefined;
  try {
    const code = resolveJurisdictionCode(pack);
    return join(getJurisdictionPackRoot(code), "correspondence", "style.yaml");
  } catch {
    return join(
      getInstallRoot(),
      "steward",
      "jurisdiction-packs",
      pack,
      "correspondence",
      "style.yaml"
    );
  }
}

export function loadCorrespondenceStyle(locale?: string): CorrespondenceStyle {
  const resolved = locale ?? resolveCorrespondenceLocale();
  const path = correspondenceStylePath(resolved);
  if (!path || !existsSync(path)) {
    return { ...FALLBACK_STYLE, locale: resolved };
  }
  const raw = YAML.parse(readFileSync(path, "utf-8"));
  return correspondenceStyleSchema.parse(raw);
}

export function companyDisplayName(legalOrTradeName: string): string {
  return legalOrTradeName.replace(/^株式会社\s*/, "").trim() || legalOrTradeName;
}

export function fillStyleTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? "");
}
