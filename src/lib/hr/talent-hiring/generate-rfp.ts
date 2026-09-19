import {
  projectRequirementSchema,
  structuredRfpSchema,
  type GenerateRfpDeps,
  type ProjectRequirement,
  type StructuredRFP,
} from "../../../../schemas/talent-hiring.js";

const DEFAULT_MIN_YEARS = 0;
const DEFAULT_BUDGET_CURRENCY = "JPY";
const DEFAULT_MAX_HOURLY_RATE = 0;

function scopeOf(requirement: ProjectRequirement): string {
  return [requirement.summary, requirement.domain, requirement.duration_days]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
}

export function generateRFP(
  requirement: ProjectRequirement,
  deps?: GenerateRfpDeps,
): StructuredRFP {
  const parsed = projectRequirementSchema.parse(requirement);
  const skills = [...(parsed.must_have_skills ?? [])];
  const base: StructuredRFP = {
    title: parsed.summary,
    scope: scopeOf(parsed),
    selection_criteria: [...skills],
    budget: parsed.budget ?? {
      max_hourly_rate: DEFAULT_MAX_HOURLY_RATE,
      currency: DEFAULT_BUDGET_CURRENCY,
    },
    must_have_skills: [...skills],
    min_years: DEFAULT_MIN_YEARS,
  };
  const enriched = deps?.enricher?.enrich(parsed);
  return structuredRfpSchema.parse(enriched ? { ...base, ...enriched } : base);
}
