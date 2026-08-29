import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { buildCustomersPipelineView } from "../src/lib/sales-pipeline-board-view.js";
import { buildCustomersAccountsView } from "../src/lib/sales-accounts-view.js";
import { setDealStage, setDealNextAction } from "../src/lib/sales-deal-service.js";
import { promoteInquiryToDeal } from "../src/lib/sales-handoff.js";
import { findDeal } from "../src/lib/sales-deal-service.js";

const SECRET_EMAIL = "secret-l2@prospect.example";
const SECRET_PHONE = "03-9999-8888";

function cleanup(): void {
  for (const p of [join(getDataDir(), "sales"), join(getDataDir(), "customers")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function seed(): void {
  mkdirSync(join(getDataDir(), "customers"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales", "inbound"), { recursive: true });

  writeFileSync(
    join(getDataDir(), "customers", "accounts.yaml"),
    YAML.stringify({
      version: 1,
      accounts: [
        {
          id: "CUST-2026-040",
          company: "L2 Guard Co",
          lifecycle: "prospect",
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "customers", "contacts.yaml"),
    YAML.stringify({
      version: 1,
      contacts: [
        {
          id: "CONTACT-2026-040",
          account_id: "CUST-2026-040",
          name: "Hidden",
          email: SECRET_EMAIL,
          phone: SECRET_PHONE,
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "sales", "pipeline.yaml"),
    YAML.stringify({
      version: 1,
      deals: [
        {
          id: "DEAL-2026-040",
          title: "Console deal",
          stage: "lead",
          owner_name: "op",
          account_id: "CUST-2026-040",
          amount_man: 80,
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "sales", "inbound", "inquiries.yaml"),
    YAML.stringify({
      version: 1,
      inquiries: [
        {
          id: "INQ-2026-040",
          received_on: "2026-08-01",
          subject: "Ready",
          company: "L2 Guard Co",
          status: "qualified",
          account_id: "CUST-2026-040",
          owner_name: "op",
        },
      ],
    }),
    "utf-8",
  );
}

describe("customers API sales write surfaces (L1)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seed();
  });

  afterEach(() => cleanup());

  it("pipeline and accounts views omit contact email/phone", () => {
    const pipelineJson = JSON.stringify(buildCustomersPipelineView());
    const accountsJson = JSON.stringify(buildCustomersAccountsView());
    expect(pipelineJson).not.toContain(SECRET_EMAIL);
    expect(pipelineJson).not.toContain(SECRET_PHONE);
    expect(accountsJson).not.toContain(SECRET_EMAIL);
    expect(accountsJson).not.toContain(SECRET_PHONE);
    expect(accountsJson).not.toMatch(/"email"/);
    expect(accountsJson).not.toMatch(/"phone"/);
  });

  it("set-stage and set-next-action (Console POST domain)", () => {
    setDealStage({
      dealId: "DEAL-2026-040",
      toStage: "qualify",
      actor: { operator_id: "console" },
    });
    expect(findDeal("DEAL-2026-040")?.stage).toBe("qualify");

    setDealNextAction({
      dealId: "DEAL-2026-040",
      next_action: "見積送付",
      next_action_due: "2026-09-01",
      actor: { operator_id: "console" },
    });
    expect(findDeal("DEAL-2026-040")?.next_action).toBe("見積送付");
  });

  it("requires lost_reason for lost (same as POST)", () => {
    expect(() =>
      setDealStage({
        dealId: "DEAL-2026-040",
        toStage: "lost",
        actor: { operator_id: "console" },
      }),
    ).toThrow(/lost_reason/);

    setDealStage({
      dealId: "DEAL-2026-040",
      toStage: "lost",
      lostReason: "timing",
      actor: { operator_id: "console" },
    });
    expect(findDeal("DEAL-2026-040")?.lost_reason).toBe("timing");
  });

  it("promote inquiry (Console POST domain)", () => {
    const r = promoteInquiryToDeal({
      inquiryId: "INQ-2026-040",
      actor: "console",
    });
    expect(r.deal_id).toMatch(/^DEAL-/);
    const view = JSON.stringify(buildCustomersPipelineView());
    expect(view).not.toContain(SECRET_EMAIL);
  });
});
