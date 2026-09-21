import { describe, expect, it } from "vitest";
import { CAP, evaluateCapability, grantedCapabilitiesFromSecurity } from "../src/lib/module-capability.js";
import { validateModuleAiDeclaration } from "../src/lib/module-ai-declaration.js";
import { listCatalogModuleIds, moduleAiDeclarationIssues } from "../src/lib/modules.js";
import { parseModuleSecuritySection } from "../schemas/module-security-manifest.js";

const DECLARED = {
  ai: {
    can_observe: true,
    can_analyze: true,
    can_draft: true,
    can_propose: false,
    can_approve: false,
    can_execute: false,
  },
};

describe("validateModuleAiDeclaration", () => {
  it("accepts an explicit declaration", () => {
    expect(validateModuleAiDeclaration(DECLARED)).toEqual([]);
  });

  it("rejects a missing security.ai block", () => {
    expect(validateModuleAiDeclaration(undefined)).toContain("security.ai is undeclared");
    expect(validateModuleAiDeclaration({})).toContain("security.ai is undeclared");
    expect(validateModuleAiDeclaration({ limits: { concurrent_jobs: 2 } })).toContain(
      "security.ai is undeclared",
    );
  });

  it("rejects an omitted key", () => {
    const { can_propose: _omitted, ...rest } = DECLARED.ai;
    expect(validateModuleAiDeclaration({ ai: rest })).toContain("security.ai.can_propose is undeclared");
  });

  it("rejects can_approve true", () => {
    expect(
      validateModuleAiDeclaration({ ai: { ...DECLARED.ai, can_approve: true } }),
    ).toContain("security.ai.can_approve must be false");
  });

  it("rejects can_execute true", () => {
    expect(
      validateModuleAiDeclaration({ ai: { ...DECLARED.ai, can_execute: true } }),
    ).toContain("security.ai.can_execute must be false");
  });
});

describe("catalog manifests", () => {
  it("declares security.ai on every catalog module", () => {
    const ids = listCatalogModuleIds();
    expect(ids.length).toBeGreaterThan(0);
    const issues = ids.flatMap((id) =>
      moduleAiDeclarationIssues(id).map((message) => `${id}: ${message}`),
    );
    expect(issues).toEqual([]);
  });
});

describe("evaluateCapability", () => {
  it("denies approve and execute for a third party even when the manifest grants them", () => {
    const granted = grantedCapabilitiesFromSecurity(
      parseModuleSecuritySection({
        trust_class: "third_party",
        ai: { can_approve: true, can_execute: true },
      }),
    );
    expect(evaluateCapability({ granted, required: CAP.aiApprove, trustClass: "third_party" })).toBe(
      "deny",
    );
    expect(evaluateCapability({ granted, required: CAP.aiExecute, trustClass: "third_party" })).toBe(
      "deny",
    );
  });
});
