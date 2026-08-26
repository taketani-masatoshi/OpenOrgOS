import { describe, expect, it } from "vitest";
import {
  assertFounderGrandfatherPolicy,
  findStandingOperatorEmailCollisions,
  isOooLoginEmailAllowed,
  listOperatorEmailsOutsideLoginPolicy,
  normalizeOooLoginEmailPolicy,
  operatorEmailRequiresLoginDomain,
  standingEntriesFromRegistry,
} from "../src/lib/org/ooo-login-email.js";
import type { OperatorRegistry } from "../schemas/org/operator.js";

function registry(partial: Partial<OperatorRegistry> & { operators: OperatorRegistry["operators"] }): OperatorRegistry {
  return { version: "1", ...partial };
}

describe("OOO login email policy", () => {
  const policy = normalizeOooLoginEmailPolicy({
    email_domains: ["malkk.com"],
    grandfather_emails: ["founder@gmail.com"],
  });

  it("allows company domain and subdomains", () => {
    expect(isOooLoginEmailAllowed("ceo@malkk.com", policy)).toBe(true);
    expect(isOooLoginEmailAllowed("ceo@mail.malkk.com", policy)).toBe(true);
  });

  it("allows grandfathered personal email only", () => {
    expect(isOooLoginEmailAllowed("founder@gmail.com", policy)).toBe(true);
    expect(isOooLoginEmailAllowed("other@gmail.com", policy)).toBe(false);
  });

  it("does not treat lookalike domains as a match", () => {
    expect(isOooLoginEmailAllowed("ceo@notmalkk.com", policy)).toBe(false);
    expect(isOooLoginEmailAllowed("ceo@malkk.com.evil.test", policy)).toBe(false);
  });

  it("allows any valid email when domains are unset", () => {
    const open = normalizeOooLoginEmailPolicy({ email_domains: [], grandfather_emails: [] });
    expect(isOooLoginEmailAllowed("anyone@gmail.com", open)).toBe(true);
  });

  it("skips domain checks for guests and mcp_service", () => {
    expect(operatorEmailRequiresLoginDomain({ role: "mcp_service" })).toBe(false);
    expect(
      operatorEmailRequiresLoginDomain({ role: "readonly", guest_expires_at: "2099-12-31" }),
    ).toBe(false);
    expect(operatorEmailRequiresLoginDomain({ role: "ceo" })).toBe(true);
  });

  it("lists active human operators whose email is off-policy", () => {
    const outside = listOperatorEmailsOutsideLoginPolicy(
      registry({
        login_policy: { email_domains: ["malkk.com"], grandfather_emails: [] },
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "ceo@gmail.com",
          },
          {
            operator_id: "OP-002",
            display_name: "Guest",
            role: "readonly",
            status: "active",
            email: "tax@advisor.example",
            guest_expires_at: "2099-12-31",
          },
        ],
      }),
    );
    expect(outside.map((r) => r.operator_id)).toEqual(["OP-001"]);
  });
});

describe("founder grandfather policy", () => {
  it("rejects more than one grandfather email", () => {
    const issues = assertFounderGrandfatherPolicy(
      registry({
        login_policy: {
          email_domains: ["malkk.com"],
          grandfather_emails: ["a@gmail.com", "b@gmail.com"],
        },
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "a@gmail.com",
          },
        ],
      }),
    );
    expect(issues.some((i) => i.code === "grandfather_too_many")).toBe(true);
  });

  it("requires grandfather to match active ceo", () => {
    const issues = assertFounderGrandfatherPolicy(
      registry({
        login_policy: {
          email_domains: ["malkk.com"],
          grandfather_emails: ["other@gmail.com"],
        },
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "ceo@malkk.com",
          },
        ],
      }),
    );
    expect(issues.some((i) => i.code === "grandfather_not_ceo")).toBe(true);
  });

  it("rejects personal email on non-ceo standing seat", () => {
    const issues = assertFounderGrandfatherPolicy(
      registry({
        login_policy: {
          email_domains: ["malkk.com"],
          grandfather_emails: ["ceo@gmail.com"],
        },
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "ceo@gmail.com",
          },
          {
            operator_id: "OP-002",
            display_name: "Ops",
            role: "operator",
            status: "active",
            email: "helper@gmail.com",
          },
        ],
      }),
    );
    expect(issues.some((i) => i.code === "personal_not_founder" && i.operator_id === "OP-002")).toBe(
      true,
    );
  });

  it("requires email_domains before a second standing human", () => {
    const issues = assertFounderGrandfatherPolicy(
      registry({
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "ceo@gmail.com",
          },
          {
            operator_id: "OP-002",
            display_name: "Ops",
            role: "operator",
            status: "active",
            email: "ops@gmail.com",
          },
        ],
      }),
    );
    expect(issues.some((i) => i.code === "second_human_without_domain")).toBe(true);
  });

  it("allows guests without counting as second human", () => {
    const issues = assertFounderGrandfatherPolicy(
      registry({
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "ceo@gmail.com",
          },
          {
            operator_id: "OP-GUEST",
            display_name: "Tax",
            role: "readonly",
            status: "active",
            email: "tax@advisor.example",
            guest_expires_at: "2099-12-31",
          },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it("allows founder ceo + company-domain human", () => {
    const issues = assertFounderGrandfatherPolicy(
      registry({
        login_policy: {
          email_domains: ["malkk.com"],
          grandfather_emails: ["ceo@gmail.com"],
        },
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "ceo@gmail.com",
          },
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
    expect(issues).toEqual([]);
  });
});

describe("standing operator email collisions", () => {
  it("flags the same standing email on two tenants", () => {
    const collisions = findStandingOperatorEmailCollisions([
      {
        tenantId: "mal",
        operator_id: "OP-001",
        email: "shared@gmail.com",
        role: "ceo",
        status: "active",
        guest: false,
      },
      {
        tenantId: "other",
        operator_id: "OP-001",
        email: "shared@gmail.com",
        role: "operator",
        status: "active",
        guest: false,
      },
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.seats.map((s) => s.tenantId).sort()).toEqual(["mal", "other"]);
  });

  it("does not flag when one seat is a guest", () => {
    const collisions = findStandingOperatorEmailCollisions([
      {
        tenantId: "mal",
        operator_id: "OP-001",
        email: "shared@gmail.com",
        role: "ceo",
        status: "active",
        guest: false,
      },
      {
        tenantId: "other",
        operator_id: "OP-GUEST",
        email: "shared@gmail.com",
        role: "readonly",
        status: "active",
        guest: true,
      },
    ]);
    expect(collisions).toEqual([]);
  });

  it("builds standing entries from a registry", () => {
    const entries = standingEntriesFromRegistry(
      "mal",
      registry({
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "ceo@malkk.com",
          },
        ],
      }),
    );
    expect(entries).toEqual([
      {
        tenantId: "mal",
        operator_id: "OP-001",
        email: "ceo@malkk.com",
        role: "ceo",
        status: "active",
        guest: false,
      },
    ]);
  });
});
