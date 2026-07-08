import { describe, it, expect, afterEach } from "vitest";
import {
  validateTrustedOperatorsRegistry,
  checkRevocationSla,
  revokeTrustedOperator,
  submitGovernanceRequest,
  decideGovernanceRequest,
  loadTrustedOperatorsRegistry,
  saveTrustedOperatorsRegistry,
} from "../src/lib/protocol/trusted-operators.js";

function cleanupTestOperator(): void {
  const reg = loadTrustedOperatorsRegistry();
  reg.operators = reg.operators.filter((o) => o.operator_id !== "OP-TEST-GOV");
  reg.governance_requests = reg.governance_requests.filter((r) => r.operator_id !== "OP-TEST-GOV");
  saveTrustedOperatorsRegistry(reg);
}

describe("trusted operators registry", () => {
  afterEach(() => cleanupTestOperator());
  it("validates platform registry", () => {
    const result = validateTrustedOperatorsRegistry();
    expect(result.ok).toBe(true);
  });

  it("checks revocation SLA with no overdue revocations", () => {
    const result = checkRevocationSla();
    expect(result.ok).toBe(true);
  });

  it("governance submit and approve flow", () => {
    const req = submitGovernanceRequest({
      operatorId: "OP-TEST-GOV",
      orgName: "Test Operator",
      jurisdiction: "JP",
      hubIds: ["HUB-TEST"],
      requestedBy: "committee-chair",
    });
    expect(req.status).toBe("pending");

    const { request, operator } = decideGovernanceRequest({
      requestId: req.request_id,
      approve: true,
      decidedBy: "committee-chair",
      authorityId: "WTA-JP-DEMO",
    });
    expect(request.status).toBe("approved");
    expect(operator?.operator_id).toBe("OP-TEST-GOV");

    revokeTrustedOperator({ operatorId: "OP-TEST-GOV", reason: "test cleanup" });
  });
});
