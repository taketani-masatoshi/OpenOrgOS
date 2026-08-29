import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ZodError } from "zod";
import {
  isModuleEnabled,
  loadModuleDataFile,
  resolveModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { resolveTenantPath } from "../../../../../../src/lib/utils.js";
import { privacyPolicyMetaSchema, type PrivacyPolicyMeta } from "./schema.js";

export const MODULE_ID = "jp_privacy_policy";

const POLICY_META_FILE = "policy-meta.yaml";
const POLICY_TEMPLATE = "privacy-policy-template.md";
/** Publication target declared by `seed/00-README.md`. */
const PUBLISHED_DOCUMENT = "docs/compliance/privacy/privacy-policy.md";
const UNSET = "—";

/** Disclosures a published JP privacy policy must carry (個人情報保護法 公表事項). */
const REQUIRED_SECTIONS = [
  { id: "basic_policy", label: "基本方針", pattern: /基本方針/ },
  { id: "collected_data", label: "取得する情報", pattern: /取得(する)?(情報|個人情報)/ },
  { id: "purpose", label: "利用目的", pattern: /利用目的/ },
  { id: "third_party", label: "第三者提供", pattern: /第三者(への)?提供/ },
  { id: "contact", label: "問合せ窓口", pattern: /問合せ|問い合わせ|窓口/ },
] as const;

type DocumentSource = "published" | "tenant" | "seed";

interface PolicyDocument {
  source: DocumentSource;
  path: string;
}

/** `heading` — dedicated section · `body` — disclosed inline · `none` — absent. */
type SectionMatch = "heading" | "body" | "none";

interface SectionPresence {
  id: string;
  label: string;
  match: SectionMatch;
}

/**
 * The policy text follows the same tenant-then-seed precedence as the YAML
 * source, with the published compliance document taking priority.
 */
function resolvePolicyDocument(): PolicyDocument | null {
  const candidates: Array<[DocumentSource, string]> = [
    ["published", resolveTenantPath(PUBLISHED_DOCUMENT)],
    ["tenant", resolveModuleDataFile(MODULE_ID, POLICY_TEMPLATE)],
    ["tenant", resolveModuleDataFile(MODULE_ID, `${POLICY_TEMPLATE}.example`)],
    ["seed", join(getModuleSeedDir(MODULE_ID), POLICY_TEMPLATE)],
    ["seed", join(getModuleSeedDir(MODULE_ID), `${POLICY_TEMPLATE}.example`)],
  ];
  for (const [source, path] of candidates) {
    if (existsSync(path)) return { source, path };
  }
  return null;
}

function checkSections(document: PolicyDocument | null): SectionPresence[] {
  if (!document) {
    return REQUIRED_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      match: "none" as const,
    }));
  }
  const text = readFileSync(document.path, "utf-8");
  const headings = text
    .split("\n")
    .filter((line) => line.startsWith("#"))
    .join("\n");
  return REQUIRED_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    match: section.pattern.test(headings)
      ? "heading"
      : section.pattern.test(text)
        ? "body"
        : "none",
  }));
}

function isDisclosed(section: SectionPresence): boolean {
  return section.match !== "none";
}

function loadPolicyMeta(): { data: PrivacyPolicyMeta; path: string } | null {
  return loadModuleDataFile(MODULE_ID, POLICY_META_FILE, privacyPolicyMetaSchema);
}

function describeLoadFailure(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function loadCheckedPolicyMeta(issues: string[]): PrivacyPolicyMeta | null {
  try {
    const loaded = loadPolicyMeta();
    if (!loaded) {
      issues.push(`${POLICY_META_FILE} missing`);
      return null;
    }
    return loaded.data;
  } catch (error) {
    issues.push(`${POLICY_META_FILE} invalid — ${describeLoadFailure(error)}`);
    return null;
  }
}

function orUnset(value: string | null | undefined): string {
  return value === null || value === undefined ? UNSET : value;
}

export function runPrivacyPolicyShow(opts: { json?: boolean }): void {
  const meta = loadPolicyMeta()?.data ?? null;
  const document = resolvePolicyDocument();
  const sections = checkSections(document);
  const missing = sections.filter((section) => !isDisclosed(section));

  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    status: meta?.status ?? null,
    version: meta?.version ?? null,
    published_at: meta?.published_at ?? null,
    published_url: meta?.published_url ?? null,
    contact_email: meta?.contact_email ?? null,
    dpo_role: meta?.dpo_role ?? null,
    regulation_ref: meta?.regulation_ref ?? null,
    review_cycle: meta?.review_cycle ?? null,
    next_review: meta?.next_review ?? null,
    required_sections: sections.length,
    disclosed_sections: sections.length - missing.length,
    missing_sections: missing.map((section) => section.label),
    document,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`# ${MODULE_ID}\n`);
  if (!meta) {
    console.log(`policy: ${POLICY_META_FILE} not found`);
  } else {
    console.log(`policy: v${meta.version} · ${meta.status}`);
    console.log(
      `published: ${orUnset(meta.published_at)} · url ${orUnset(meta.published_url)}`
    );
    console.log(`review: ${meta.review_cycle} · next review ${orUnset(meta.next_review)}`);
    console.log(
      `contact: ${meta.contact_email} · ${meta.dpo_role} · 規程 ${orUnset(meta.regulation_ref)}`
    );
  }
  console.log(
    `document: ${document ? document.source : "not found"} · disclosures ${summary.disclosed_sections}/${summary.required_sections}`
  );
}

export function runPrivacyPolicyValidate(): void {
  const issues: string[] = [];
  const warnings: string[] = [];
  const meta = loadCheckedPolicyMeta(issues);

  if (meta) checkPolicyMeta(meta, issues, warnings);

  const document = resolvePolicyDocument();
  if (!document) {
    issues.push(`${POLICY_TEMPLATE} not found in tenant data or module seed`);
  } else if (document.source === "seed") {
    warnings.push("policy document is the module seed copy — not deployed to tenant docs");
  }

  for (const section of checkSections(document)) {
    if (section.match === "none") {
      issues.push(`policy document missing required disclosure: ${section.label}`);
    } else if (section.match === "body") {
      warnings.push(`${section.label}: 本文に記載あり — 独立した見出しがない`);
    }
  }

  if (issues.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
    return;
  }

  console.log(
    `✓ ${MODULE_ID} — v${meta?.version} ${meta?.status} · ${REQUIRED_SECTIONS.length} required disclosure(s) OK`
  );
  for (const warning of warnings) console.log(`  ! ${warning}`);
  if (!isModuleEnabled(MODULE_ID)) {
    console.log("note: module not enabled in this tenant — catalog seed validated");
  }
}

function checkPolicyMeta(meta: PrivacyPolicyMeta, issues: string[], warnings: string[]): void {
  if (meta.module_id !== MODULE_ID) {
    issues.push(`${POLICY_META_FILE}: module_id ${meta.module_id} != ${MODULE_ID}`);
  }
  if (meta.status === "published") {
    if (!meta.published_at) issues.push("status published requires published_at");
    if (!meta.published_url) issues.push("status published requires published_url");
  } else {
    warnings.push(`status ${meta.status} — policy not published`);
  }
  if (meta.published_at && meta.next_review && meta.next_review <= meta.published_at) {
    issues.push(`next_review ${meta.next_review} must follow published_at ${meta.published_at}`);
  }
  if (!meta.next_review) {
    warnings.push(`next_review unset (review cycle: ${meta.review_cycle})`);
  }
  if (!meta.regulation_ref) {
    warnings.push("regulation_ref unset — 社内規程との整合先が未指定");
  }
}

export function runPrivacyPolicyStatus(opts: { json?: boolean }): void {
  const meta = loadPolicyMeta();
  if (!meta) {
    console.error(`${MODULE_ID}: ${POLICY_META_FILE} not found`);
    process.exit(1);
    return;
  }

  const document = resolvePolicyDocument();
  const sections = checkSections(document);
  const published = meta.data.status === "published";

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          module: MODULE_ID,
          version: meta.data.version,
          status: meta.data.status,
          published,
          published_at: meta.data.published_at ?? null,
          published_url: meta.data.published_url ?? null,
          review_cycle: meta.data.review_cycle,
          next_review: meta.data.next_review ?? null,
          contact_email: meta.data.contact_email,
          dpo_role: meta.data.dpo_role,
          regulation_ref: meta.data.regulation_ref ?? null,
          document,
          sections,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`# Privacy policy status — ${MODULE_ID}\n`);
  console.log(
    `version ${meta.data.version} · ${published ? "published" : `${meta.data.status}（未公表）`}`
  );
  console.log(
    `last published: ${orUnset(meta.data.published_at)} · url ${orUnset(meta.data.published_url)}`
  );
  console.log(
    `review: ${meta.data.review_cycle} · next review ${orUnset(meta.data.next_review)}`
  );
  console.log(
    `contact: ${meta.data.contact_email} · ${meta.data.dpo_role} · 規程 ${orUnset(meta.data.regulation_ref)}`
  );
  console.log(`document: ${document ? `${document.source} — ${document.path}` : "not found"}\n`);

  console.log("## Required disclosures\n");
  for (const section of sections) {
    const where = section.match === "body" ? " (本文のみ)" : "";
    console.log(`- ${isDisclosed(section) ? "✓" : "✗"} ${section.label}${where}`);
  }

  const missing = sections.filter((section) => !isDisclosed(section)).length;
  console.log(
    `\n${sections.length - missing}/${sections.length} required disclosure(s) present${missing ? ` · ${missing} missing` : ""}`
  );
}
