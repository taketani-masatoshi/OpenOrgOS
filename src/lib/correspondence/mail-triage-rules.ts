import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import {
  mailTriageRulesSchema,
  type MailTriageRules,
  type MailTriageRuleSet,
} from "../../../schemas/correspondence/mail-triage-rules.js";
import { readYamlFile } from "../utils.js";
import { getCoreMailTriageRulesPath, getTenantMailTriageRulesPath } from "./paths.js";

function loadRulesFile(path: string): MailTriageRules | null {
  if (!existsSync(path)) return null;
  return readYamlFile(path, mailTriageRulesSchema);
}

function mergeRuleSet(
  base: MailTriageRuleSet | undefined,
  override: MailTriageRuleSet | undefined
): MailTriageRuleSet | undefined {
  if (!base && !override) return undefined;
  return {
    from_addresses: [...(base?.from_addresses ?? []), ...(override?.from_addresses ?? [])],
    from_domains: [...(base?.from_domains ?? []), ...(override?.from_domains ?? [])],
    subject_keywords: [...(base?.subject_keywords ?? []), ...(override?.subject_keywords ?? [])],
    subject_patterns: [...(base?.subject_patterns ?? []), ...(override?.subject_patterns ?? [])],
  };
}

function mergeTierRules<T extends Record<string, MailTriageRuleSet | undefined>>(
  base: T | undefined,
  override: T | undefined
): T | undefined {
  if (!base && !override) return undefined;
  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(override ?? {})]);
  const out = {} as T;
  for (const key of keys) {
    const merged = mergeRuleSet(base?.[key as keyof T], override?.[key as keyof T]);
    if (merged) (out as Record<string, MailTriageRuleSet>)[key] = merged;
  }
  return out;
}

export function loadMailTriageRules(): MailTriageRules {
  const core = loadRulesFile(getCoreMailTriageRulesPath());
  const tenant = loadRulesFile(getTenantMailTriageRulesPath());
  const base = core ?? mailTriageRulesSchema.parse({ version: 1 });
  if (!tenant) return base;

  return mailTriageRulesSchema.parse({
    version: 1,
    spam: mergeRuleSet(base.spam, tenant.spam),
    suspicious: mergeRuleSet(base.suspicious, tenant.suspicious),
    importance: mergeTierRules(base.importance, tenant.importance),
    urgency: mergeTierRules(base.urgency, tenant.urgency),
    routing: { ...base.routing, ...tenant.routing },
  });
}

export function parseMailTriageRulesYaml(contents: string): MailTriageRules {
  return mailTriageRulesSchema.parse(YAML.parse(contents));
}

export function readMailTriageRulesRaw(path: string): string {
  return readFileSync(path, "utf-8");
}
