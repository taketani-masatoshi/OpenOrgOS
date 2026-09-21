/**
 * Module AI permission declaration — raw YAML, before zod defaults.
 * Path: src/lib/module-ai-declaration.ts
 * Canonical: docs/adr/0079-module-ai-permission-declaration.md
 *
 * Omitted keys are not "safe". Defaults hide an undeclared manifest.
 */

export const MODULE_AI_PERMISSION_KEYS = [
  "can_observe",
  "can_analyze",
  "can_draft",
  "can_propose",
  "can_approve",
  "can_execute",
] as const;

export type ModuleAiPermissionKey = (typeof MODULE_AI_PERMISSION_KEYS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Issues in `security` as it appears in module.manifest.yaml, before schema defaults.
 * `can_approve` and `can_execute` stay false until a separate ADR opens an exception.
 */
export function validateModuleAiDeclaration(security: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(security) || !isRecord(security.ai)) {
    issues.push("security.ai is undeclared");
    return issues;
  }

  const ai = security.ai;
  for (const key of MODULE_AI_PERMISSION_KEYS) {
    if (!(key in ai)) {
      issues.push(`security.ai.${key} is undeclared`);
      continue;
    }
    if (typeof ai[key] !== "boolean") {
      issues.push(`security.ai.${key} must be boolean`);
    }
  }

  if (ai.can_approve === true) {
    issues.push("security.ai.can_approve must be false");
  }
  if (ai.can_execute === true) {
    issues.push("security.ai.can_execute must be false");
  }

  return issues;
}
