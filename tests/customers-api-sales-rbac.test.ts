import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { handleCustomersApi } from "../src/lib/steward-chat/routes/customers-api.js";
import type { WireConsoleUser } from "../src/lib/wire-console/auth/session.js";
import * as navGate from "../src/lib/customers-nav-gate.js";
import * as dealService from "../src/lib/sales-deal-service.js";
import type { SalesDeal } from "../schemas/sales.js";

function mockRes(): {
  res: ServerResponse;
  status: () => number;
  body: () => unknown;
} {
  let status = 0;
  let raw = "";
  const res = {
    writeHead(code: number) {
      status = code;
    },
    end(chunk?: string) {
      raw = chunk ?? "";
    },
  } as unknown as ServerResponse;
  return {
    res,
    status: () => status,
    body: () => (raw ? JSON.parse(raw) : null),
  };
}

function mockReq(method: string, jsonBody: unknown): IncomingMessage {
  const payload = Buffer.from(JSON.stringify(jsonBody), "utf-8");
  const stream = Readable.from([payload]) as IncomingMessage;
  stream.method = method;
  stream.headers = {
    "content-type": "application/json",
    "content-length": String(payload.length),
  };
  return stream;
}

const askOnly: WireConsoleUser = {
  operator_id: "OP-ASK",
  approver_id: "guest-not-authorized",
  mode: "prod",
};

const approver: WireConsoleUser = {
  operator_id: "OP-001",
  approver_id: "CEO",
  mode: "dev",
};

const fakeDeal: SalesDeal = {
  id: "DEAL-2026-099",
  title: "RBAC",
  stage: "negotiation",
  owner_name: "op",
  amount_man: 50,
};

describe("customers API sales RBAC (POST set-stage)", () => {
  beforeEach(() => {
    setTenantId("demo");
    vi.spyOn(navGate, "resolveCustomersNavGate").mockReturnValue({
      show_tab: true,
      sales_enabled: true,
      customer_success_enabled: false,
      sales_module_installed: true,
      customer_success_module_installed: false,
      sales_agent_grace: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects won stage without chat:approve", async () => {
    const setStage = vi.spyOn(dealService, "setDealStage").mockReturnValue({
      ...fakeDeal,
      stage: "won",
    });
    const { res, status, body } = mockRes();
    await handleCustomersApi(
      mockReq("POST", { deal_id: "DEAL-2026-099", stage: "won" }),
      res,
      "/chat/v1/customers/deals/set-stage",
      "POST",
      askOnly,
    );
    expect(status()).toBe(403);
    expect((body() as { permission?: string }).permission).toBe("chat:approve");
    expect(setStage).not.toHaveBeenCalled();
  });

  it("rejects reopen without chat:approve", async () => {
    const setStage = vi.spyOn(dealService, "setDealStage").mockReturnValue(fakeDeal);
    const { res, status, body } = mockRes();
    await handleCustomersApi(
      mockReq("POST", {
        deal_id: "DEAL-2026-099",
        stage: "qualify",
        reopen: true,
      }),
      res,
      "/chat/v1/customers/deals/set-stage",
      "POST",
      askOnly,
    );
    expect(status()).toBe(403);
    expect((body() as { permission?: string }).permission).toBe("chat:approve");
    expect(setStage).not.toHaveBeenCalled();
  });

  it("allows open-stage transition with chat:ask", async () => {
    const setStage = vi.spyOn(dealService, "setDealStage").mockReturnValue({
      ...fakeDeal,
      stage: "proposal",
    });
    const { res, status, body } = mockRes();
    await handleCustomersApi(
      mockReq("POST", { deal_id: "DEAL-2026-099", stage: "proposal" }),
      res,
      "/chat/v1/customers/deals/set-stage",
      "POST",
      askOnly,
    );
    expect(status()).toBe(200);
    expect((body() as { ok?: boolean }).ok).toBe(true);
    expect(setStage).toHaveBeenCalled();
  });

  it("allows won with approver session", async () => {
    const setStage = vi.spyOn(dealService, "setDealStage").mockReturnValue({
      ...fakeDeal,
      stage: "won",
    });
    const { res, status } = mockRes();
    await handleCustomersApi(
      mockReq("POST", { deal_id: "DEAL-2026-099", stage: "won" }),
      res,
      "/chat/v1/customers/deals/set-stage",
      "POST",
      approver,
    );
    expect(status()).toBe(200);
    expect(setStage).toHaveBeenCalled();
  });
});
