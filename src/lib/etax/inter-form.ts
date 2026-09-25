import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_SPEC_RELATIVE_DIR } from "./constants.js";

/**
 * Optional e-tax08 inter-form rule catalog.
 * Empty / missing file means "no loaded dependency rules" for forms not listed.
 */
const interFormRuleSchema = z.object({
  formId: z.string().min(1),
  source: z.string().min(1).optional(),
  dependsOn: z.array(z.string()).default([]),
  status: z.enum(["loaded", "unloaded"]).default("loaded"),
  notes: z.string().optional(),
});

const interFormCatalogSchema = z.object({
  schema_version: z.literal(1),
  specFamily: z.literal("ksk2"),
  /** Forms that have dependency rules in the official pack but are not yet loaded as data. */
  unloadedFormsWithRules: z.array(z.string()).default([]),
  /** Forms explicitly confirmed to have no inter-form dependencies for OpenOrgOS. */
  formsWithNoDependencies: z.array(z.string()).default([]),
  /** Formal e-tax08 rows transcribed as data. */
  rules: z.array(interFormRuleSchema).default([]),
  notes: z.string().optional(),
});

export type EtaxInterFormCatalog = z.output<typeof interFormCatalogSchema>;

export function etaxInterFormCatalogPath(): string {
  return join(getInstallRoot(), ETAX_SPEC_RELATIVE_DIR, "inter-form-rules.yaml");
}

export function loadInterFormCatalog(): EtaxInterFormCatalog {
  const path = etaxInterFormCatalogPath();
  if (!existsSync(path)) {
    return {
      schema_version: 1,
      specFamily: "ksk2",
      unloadedFormsWithRules: [],
      formsWithNoDependencies: [],
      rules: [],
      notes: "missing catalog — treat unknown forms as no-dependency until e-tax08 is loaded",
    };
  }
  return interFormCatalogSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export type InterFormCheck =
  | { status: "pass"; detail: string }
  | { status: "SPEC_BLOCKED"; detail: string };

export function checkInterFormRules(formId: string): InterFormCheck {
  const catalog = loadInterFormCatalog();
  if (catalog.unloadedFormsWithRules.includes(formId)) {
    return {
      status: "SPEC_BLOCKED",
      detail: `e-tax08 rules exist for ${formId} but are not loaded as OpenOrgOS data`,
    };
  }
  const rule = catalog.rules.find((row) => row.formId === formId);
  if (rule) {
    if (rule.status === "unloaded") {
      return {
        status: "SPEC_BLOCKED",
        detail: `e-tax08 rule for ${formId} is marked unloaded`,
      };
    }
    if (rule.dependsOn.length === 0) {
      return {
        status: "pass",
        detail: `e-tax08 loaded rule: ${formId} has no form dependencies`,
      };
    }
    return {
      status: "pass",
      detail: `e-tax08 loaded rule: ${formId} depends on ${rule.dependsOn.join(",")}`,
    };
  }
  if (catalog.formsWithNoDependencies.includes(formId)) {
    return {
      status: "pass",
      detail: `No inter-form dependencies declared for ${formId}`,
    };
  }
  return {
    status: "pass",
    detail: `No e-tax08 dependency entry for ${formId} (treated as none)`,
  };
}
