import { describe, expect, it } from "vitest";
import { formatOperatorSessionLabel } from "../apps/shared/formatOperatorSessionLabel.js";

describe("formatOperatorSessionLabel", () => {
  const user = {
    operator_id: "OP-001",
    approver_id: "Demo CEO",
    mode: "dev",
  };

  it("keeps Japanese as the default", () => {
    expect(formatOperatorSessionLabel(user)).toBe(
      "オペレータ OP-001 · 承認者 Demo CEO · 開発モード",
    );
  });

  it("renders English without leftover Japanese chrome", () => {
    expect(formatOperatorSessionLabel(user, "en")).toBe(
      "Operator OP-001 · Approver Demo CEO · Dev mode",
    );
  });
});
