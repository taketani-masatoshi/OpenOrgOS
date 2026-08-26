import { describe, expect, it } from "vitest";
import {
  assertCanAddStandingHuman,
  assertFounderMigrationPolicy,
  isGrandfatherEmailEffective,
  isOooLoginEmailAllowedForRegistry,
} from "../src/lib/org/ooo-login-email.js";
import type { OperatorRegistry } from "../schemas/org/operator.js";

function registry(partial: Partial<OperatorRegistry> & { operators: OperatorRegistry["operators"] }): OperatorRegistry {
  return { version: "1", ...partial };
}

describe("founder migration policy", () => {
  it("allows grandfather email while grace is open", () => {
    const reg = registry({
      login_policy: {
        email_domains: ["malkk.com"],
        grandfather_emails: ["founder@gmail.com"],
        founder_migration: { status: "open", grace_until: "2099-12-31" },
      },
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          email: "founder@gmail.com",
        },
      ],
    });
    expect(isGrandfatherEmailEffective(reg, "founder@gmail.com")).toBe(true);
    expect(isOooLoginEmailAllowedForRegistry("founder@gmail.com", reg)).toBe(true);
  });

  it("blocks grandfather email after grace expires", () => {
    const reg = registry({
      login_policy: {
        email_domains: ["malkk.com"],
        grandfather_emails: ["founder@gmail.com"],
        founder_migration: { status: "open", grace_until: "2020-01-01" },
      },
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          email: "founder@gmail.com",
        },
      ],
    });
    expect(isGrandfatherEmailEffective(reg, "founder@gmail.com")).toBe(false);
    expect(isOooLoginEmailAllowedForRegistry("founder@gmail.com", reg)).toBe(false);
    expect(assertFounderMigrationPolicy(reg).some((i) => i.code === "grace_expired")).toBe(true);
  });

  it("blocks second standing human while grandfather remains", () => {
    const reg = registry({
      login_policy: {
        email_domains: ["malkk.com"],
        grandfather_emails: ["founder@gmail.com"],
        founder_migration: { status: "open", grace_until: "2099-12-31" },
      },
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          email: "founder@gmail.com",
        },
      ],
    });
    const block = assertCanAddStandingHuman(
      registry({
        ...reg,
        operators: [
          ...reg.operators,
          {
            operator_id: "OP-002",
            display_name: "Ops",
            role: "operator",
            status: "active",
            email: "ops@malkk.com",
          },
        ],
      }),
    );
    expect(block?.code).toBe("grandfather_blocks_second_human");
  });
});
