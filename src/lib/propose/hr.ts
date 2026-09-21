import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, readYamlFile } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

const HR_FORBIDDEN_KEYS = ["my_number", "account_number", "bank_account_number"] as const;

export function assertNoHrSecretFields(raw: Record<string, unknown>): void {
  for (const key of HR_FORBIDDEN_KEYS) {
    if (key in raw) throw new Error(`refused L2 field ${key}`);
  }
}

const DEFAULT_STEPS = ["esign_request", "social_insurance_draft"];

const lifecycleProceduresSchema = z.object({
  onboarding_steps: z.array(z.string().min(1)).default(DEFAULT_STEPS),
  offboarding_steps: z.array(z.string().min(1)).default(DEFAULT_STEPS),
});

function loadLifecycleSteps(mode: "onboarding" | "offboarding"): {
  steps: string[];
  inputs_ref: string[];
} {
  const path = join(getDataDir(), "hr", "lifecycle-procedures.yaml");
  if (!existsSync(path)) {
    return { steps: DEFAULT_STEPS, inputs_ref: [] };
  }
  try {
    const file = readYamlFile(path, lifecycleProceduresSchema);
    return {
      steps: mode === "onboarding" ? file.onboarding_steps : file.offboarding_steps,
      inputs_ref: ["data/hr/lifecycle-procedures.yaml"],
    };
  } catch {
    return { steps: DEFAULT_STEPS, inputs_ref: [] };
  }
}

export function startOnboarding(input: {
  personRef: string;
  esignCaseId?: string;
}): { personRef: string; steps: string[]; esignCaseId?: string } {
  assertNoHrSecretFields(input as unknown as Record<string, unknown>);
  const { steps } = loadLifecycleSteps("onboarding");
  return {
    personRef: input.personRef,
    esignCaseId: input.esignCaseId,
    steps,
  };
}

export function startOffboarding(input: {
  personRef: string;
  esignCaseId: string;
}): {
  personRef: string;
  esignCaseId: string;
  steps: string[];
  socialInsuranceDraft: string;
  filed: false;
} {
  assertNoHrSecretFields(input as unknown as Record<string, unknown>);
  if (!input.esignCaseId) throw new Error("pdf_esign case id is required");
  const { steps } = loadLifecycleSteps("offboarding");
  return {
    personRef: input.personRef,
    esignCaseId: input.esignCaseId,
    steps,
    socialInsuranceDraft: `${input.personRef} の社保手続き下書き。提出は人間。`,
    filed: false,
  };
}

/** One report. Procedure drafts only — no My Number, no account numbers, no filing. */
export function renderHrLifecycleReport(
  input:
    | { mode: "onboarding"; personRef: string; esignCaseId?: string }
    | { mode: "offboarding"; personRef: string; esignCaseId: string },
): Record<string, unknown> {
  const loaded = loadLifecycleSteps(input.mode);
  if (input.mode === "onboarding") {
    const started = startOnboarding(input);
    return flattenProposeReport(
      makeProposeReport({
        kind: "hr-lifecycle-report",
        depth: loaded.inputs_ref.length > 0 ? "L2" : "L1",
        inputs_ref: loaded.inputs_ref,
        human_gate: { apply: "human" },
        payload: {
          mode: "onboarding",
          personRef: started.personRef,
          esignCaseId: started.esignCaseId,
          steps: started.steps,
          secretsStored: false,
          filed: false,
        },
      }),
    );
  }
  const left = startOffboarding(input);
  return flattenProposeReport(
    makeProposeReport({
      kind: "hr-lifecycle-report",
      depth: loaded.inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref: loaded.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        mode: "offboarding",
        personRef: left.personRef,
        esignCaseId: left.esignCaseId,
        steps: left.steps,
        socialInsuranceDraft: left.socialInsuranceDraft,
        secretsStored: false,
        filed: false,
      },
    }),
  );
}
