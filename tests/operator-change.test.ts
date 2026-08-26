import { describe, it, expect, beforeAll } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { planOperatorChange } from "../src/lib/operator-change/plan.js";
import { applyOperatorChange } from "../src/lib/operator-change/apply.js";

describe("operator change plan/apply", () => {
  beforeAll(() => {
    setTenantId("mal");
  });

  it("rejects grade A paths outside whitelist", () => {
    const proposal = planOperatorChange({
      grade: "A",
      summary: "touch finance",
      intent_id: "generic",
      edits: [{ path: "data/finance/cash-balance.yaml", field: "total", value: 1 }],
    });
    expect(proposal.status).toBe("rejected");
    expect(proposal.blocked_reason).toMatch(/whitelist|not allowed/);
  });

  it("rejects grade C apply", () => {
    const proposal = planOperatorChange({
      grade: "C",
      summary: "drop insurance",
      intent_id: "generic",
      edits: [{ path: "data/properties/PROP-002.yaml", field: "notes", value: "x" }],
    });
    const result = applyOperatorChange(proposal, { write: true, dry_run: false });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/grade C|forbidden/i);
  });

  it("plans set_max_guests and dry-runs without writing", () => {
    const proposal = planOperatorChange({
      grade: "A",
      summary: "max guests 8",
      intent_id: "set_max_guests",
      max_guests: 8,
    });
    expect(proposal.status).toBe("planned");
    expect(proposal.sync_derived).toBe(true);
    const result = applyOperatorChange(proposal, { write: false, dry_run: true });
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
  });

  it("blocks dummy tokens in proposal text", () => {
    const proposal = planOperatorChange({
      grade: "A",
      summary: "dummy update",
      intent_id: "generic",
      edits: [{ path: "data/operations/kamezawa-public.yaml", field: "max_guests", value: 8 }],
    });
    expect(proposal.status).toBe("rejected");
    expect(proposal.blocked_reason).toMatch(/forbidden token|ダミー|dummy/i);
  });
});
