import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { findLedgerSignup, listLedgerSignups, createLedgerSignup, updateLedgerSignup } from "../src/lib/product/ledger-fleet.js";
import { listLedgerMailOutbox } from "../src/lib/product/ledger-mail.js";
import { handleProductApi } from "../src/lib/steward-chat/routes/product-api.js";
import { handleStripeWebhookEvent } from "../src/lib/product/stripe-webhook.js";

describe("ledger signup recovery", () => {
  const originalEnv = { ...process.env };
  let workspace = "";

  function setup() {
    workspace = mkdtempSync(join(tmpdir(), "ledger-recovery-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_ENV = "development";
    process.env.ORGOS_LEDGER_AUTO_PROVISION = "1";
    process.env.ORGOS_STRIPE_SECRETS_FILE = join(workspace, "missing-stripe-secrets.env");
    delete process.env.ORGOS_MAIL_SMTP_URL;
    delete process.env.ORGOS_LEDGER_SMTP_URL;
    refreshOrgOsPaths();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    refreshOrgOsPaths();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    workspace = "";
  });

  async function signupRequest(email = "ceo@recover.example") {
    const req = Readable.from([JSON.stringify({
      tenant_id: "recover-one", company_name: "Recover One", admin_email: email, plan: "starter",
    })]) as IncomingMessage;
    req.headers = { host: "localhost:9470" };
    let status = 0;
    let payload = "";
    const res = {
      writeHead(code: number) { status = code; },
      end(body: string) { payload = body; },
    } as unknown as ServerResponse;
    expect(await handleProductApi(req, res, "/chat/v1/product/signup", "POST")).toBe(true);
    return { status, body: JSON.parse(payload) as Record<string, unknown> };
  }

  it("retries a failed checkout with the same reservation and reuses a saved session", async () => {
    setup();
    process.env.STRIPE_SECRET_KEY = "sk_test_recovery";
    const stripe = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "temporary" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "cs_recovered", url: "https://checkout.stripe.test/recovered" }), { status: 200 }));

    expect((await signupRequest()).status).toBe(422);
    expect(listLedgerSignups()).toHaveLength(1);
    expect(findLedgerSignup("SIGNUP-recover-one")?.status).toBe("pending");

    const recovered = await signupRequest();
    expect(recovered.status).toBe(200);
    expect(recovered.body.checkout_url).toBe("https://checkout.stripe.test/recovered");
    expect(findLedgerSignup("SIGNUP-recover-one")?.stripe_checkout_session_id).toBe("cs_recovered");
    expect(stripe).toHaveBeenCalledTimes(2);
    expect((stripe.mock.calls[0]![1]!.headers as Record<string, string>)["Idempotency-Key"])
      .toBe((stripe.mock.calls[1]![1]!.headers as Record<string, string>)["Idempotency-Key"]);

    expect((await signupRequest()).body.checkout_url).toBe(recovered.body.checkout_url);
    expect(stripe).toHaveBeenCalledTimes(2);
    expect(listLedgerMailOutbox().filter((mail) => mail.kind === "signup_received")).toHaveLength(1);
    expect((await signupRequest("other@recover.example")).status).toBe(422);
  });

  it("retries only the welcome mail after tenant creation, preserving finance files", async () => {
    setup();
    const signup = createLedgerSignup({
      tenantId: "recover-one", companyName: "Recover One", adminEmail: "ceo@recover.example", plan: "starter",
    });
    updateLedgerSignup(signup.signup_id, {
      status: "checkout", stripe_checkout_session_id: "cs_recover_one",
      stripe_checkout_url: "https://checkout.stripe.test/recover-one", stripe_checkout_mode: "live",
    });
    const event = {
      type: "checkout.session.completed",
      data: { object: { id: "cs_recover_one", client_reference_id: signup.signup_id, customer: "cus_recover" } },
    };
    await expect(handleStripeWebhookEvent({
      ...event, data: { object: { ...event.data.object, id: "cs_other" } },
    })).rejects.toThrow(/does not match/);
    expect(findLedgerSignup(signup.signup_id)?.status).toBe("checkout");
    await expect(handleStripeWebhookEvent(event, async () => { throw new Error("SMTP unavailable"); }))
      .rejects.toThrow("SMTP unavailable");
    expect(findLedgerSignup(signup.signup_id)?.status).toBe("paid");
    const finance = join(workspace, "tenants/recover-one/data/finance/journal-entries.yaml");
    writeFileSync(finance, "real entries retained\n");

    expect(await handleStripeWebhookEvent(event)).toMatchObject({ action: "provisioned" });
    expect(readFileSync(finance, "utf-8")).toBe("real entries retained\n");
    expect(findLedgerSignup(signup.signup_id)).toMatchObject({ status: "provisioned" });
    const sent = () => listLedgerMailOutbox().filter((mail) => mail.kind === "provision_complete");
    expect(sent()).toHaveLength(1);
    expect(await handleStripeWebhookEvent(event)).toMatchObject({ action: "signup_already_provisioned" });
    expect(sent()).toHaveLength(1);
  });
});
