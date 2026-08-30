import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginApi } from "./helpers/api-login";

/**
 * The four claims a stub cannot test, run against the real services in
 * `deploy/integration/`. Each test states the environment it needs and skips
 * loudly when it is absent — a skipped test records no evidence, so the score
 * for that item does not move.
 */

function required(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

test.describe("orgos integration", () => {
  test("a signed Stripe webhook is accepted and an unsigned one is not", async ({
    playwright,
  }) => {
    const secret = required("STRIPE_WEBHOOK_SECRET");
    test.skip(!secret, "STRIPE_WEBHOOK_SECRET not set — start deploy/integration");

    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const payload = JSON.stringify({
      id: `evt_integration_${Date.now()}`,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_integration", status: "active" } },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret!)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const signed = await anonymous.post("/chat/v1/product/stripe/webhook", {
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      data: payload,
    });
    expect(signed.status(), await signed.text()).toBe(200);

    const unsigned = await anonymous.post("/chat/v1/product/stripe/webhook", {
      headers: { "Content-Type": "application/json" },
      data: payload,
    });
    expect(unsigned.status(), await unsigned.text()).toBe(400);
    await anonymous.dispose();
  });

  test("mail leaves the process and arrives at a real SMTP server", async ({
    request,
    playwright,
  }) => {
    const mailpit = required("ORGOS_MAILPIT_API");
    test.skip(!mailpit, "ORGOS_MAILPIT_API not set — start deploy/integration");
    test.skip(
      process.env.ORGOS_MAIL_DRY_RUN !== "0",
      "ORGOS_MAIL_DRY_RUN must be 0 for a real send",
    );

    await loginApi(request);
    const subject = `orgos integration ${Date.now()}`;
    const send = await request.post("/chat/v1/correspondence/send", {
      data: {
        to: "integration@orgos.test",
        subject,
        body: "統合環境からの実送信",
        confirmed: true,
      },
    });
    expect(send.status(), await send.text()).toBe(200);

    const inbox = await playwright.request.newContext({ baseURL: mailpit });
    const search = await inbox.get(
      `/api/v1/search?query=${encodeURIComponent(subject)}`,
    );
    expect(search.status()).toBe(200);
    const found = (await search.json()) as { messages_count: number };
    expect(found.messages_count, "the message must exist on the SMTP server").toBeGreaterThan(
      0,
    );
    await inbox.dispose();
  });

  test("eID validation runs against the live SiVa service", async ({ request }) => {
    test.skip(
      process.env.ORGOS_SIVA_MODE !== "live",
      "ORGOS_SIVA_MODE must be live — start deploy/integration",
    );

    await loginApi(request);
    const ready = await request.get("/chat/v1/esign/ready");
    expect(ready.status(), await ready.text()).toBe(200);
    const body = (await ready.json()) as {
      siva_mode: string;
      siva_reachable: boolean;
    };
    // A live mode that cannot reach SiVa is worse than mock: it claims a
    // verdict source it does not have.
    expect(body.siva_mode).toBe("live");
    expect(body.siva_reachable).toBe(true);
  });

  test("the witness hub binds to a public interface", async ({ playwright }) => {
    const port = required("ORGOS_HUB_PORT");
    test.skip(
      process.env.ORGOS_HUB_PUBLIC !== "1" || !port,
      "ORGOS_HUB_PUBLIC / ORGOS_HUB_PORT not set — start deploy/integration",
    );

    // Loopback would answer even when bound to 127.0.0.1; the LAN address is
    // the only address that proves a public bind.
    const { networkInterfaces } = await import("node:os");
    const address = Object.values(networkInterfaces())
      .flat()
      .find((nic) => nic && nic.family === "IPv4" && !nic.internal)?.address;
    test.skip(!address, "no non-loopback IPv4 interface on this host");

    const remote = await playwright.request.newContext({
      baseURL: `http://${address}:${port}`,
      ignoreHTTPSErrors: true,
    });
    const res = await remote.get("/health");
    expect(res.status(), await res.text()).toBe(200);
    await remote.dispose();
  });
});
