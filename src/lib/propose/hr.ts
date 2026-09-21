const HR_FORBIDDEN_KEYS = ["my_number", "account_number", "bank_account_number"] as const;

export function assertNoHrSecretFields(raw: Record<string, unknown>): void {
  for (const key of HR_FORBIDDEN_KEYS) {
    if (key in raw) throw new Error(`refused L2 field ${key}`);
  }
}

export function startOnboarding(input: {
  personRef: string;
  esignCaseId?: string;
}): { personRef: string; steps: string[]; esignCaseId?: string } {
  assertNoHrSecretFields(input as unknown as Record<string, unknown>);
  return {
    personRef: input.personRef,
    esignCaseId: input.esignCaseId,
    steps: ["esign_request", "social_insurance_draft"],
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
  return {
    personRef: input.personRef,
    esignCaseId: input.esignCaseId,
    steps: ["esign_request", "social_insurance_draft"],
    socialInsuranceDraft: `${input.personRef} の社保手続き下書き。提出は人間。`,
    filed: false,
  };
}
