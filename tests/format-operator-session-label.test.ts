import { describe, expect, it } from "vitest";
import { formatOperatorSessionLabel } from "../apps/shared/formatOperatorSessionLabel.js";

describe("formatOperatorSessionLabel", () => {
  const user = {
    operator_id: "OP-001",
    approver_id: "Demo CEO",
    mode: "dev",
  };

  it("keeps Japanese as the default", () => {
    expect(formatOperatorSessionLabel(user)).toBe("Demo CEO");
  });

  it("uses the same human name in English", () => {
    expect(formatOperatorSessionLabel(user, "en")).toBe("Demo CEO");
  });

  it("falls back to the operator id when no distinct name exists", () => {
    expect(
      formatOperatorSessionLabel({
        operator_id: "OP-001",
        approver_id: "OP-001",
        mode: "prod",
      }),
    ).toBe("OP-001");
  });
});
