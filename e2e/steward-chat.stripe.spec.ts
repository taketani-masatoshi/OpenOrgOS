import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * Self-serve billing: the console must never expose a Stripe secret it holds,
 * must refuse an unsigned webhook, and must state plainly whether live keys
 * are in place.
 */
test.describe("steward chat stripe self-serve", () => {
  test("stripe settings never echo the stored secret back", async ({ page, request }) => {
    await loginConsole(page);
    await loginApi(request);

    const res = await request.get("/chat/v1/product/stripe-settings");
    expect(res.status(), await res.text()).toBe(200);
    const raw = await res.text();
    // Guidance text mentions the key prefixes; an actual key value must not appear.
    expect(raw).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{6,}/);
    const body = (await res.json()) as {
      ok: boolean;
      commercial_ready: boolean;
      live_ready: boolean;
      webhook_url: string;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.commercial_ready).toBe("boolean");
    expect(typeof body.live_ready).toBe("boolean");
    expect(body.webhook_url).toContain("/chat/v1/product/stripe/webhook");
  });

  test("saving keys does not make the response leak them", async ({ request }) => {
    await loginApi(request);
    const res = await request.put("/chat/v1/product/stripe-settings", {
      data: {
        stripe_secret_key: "sk_test_e2e_placeholder",
        stripe_price_starter: "price_e2e_starter",
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.text()).not.toContain("sk_test_e2e_placeholder");
  });

  test("plans are public but subscription needs a session", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const plans = await anonymous.get("/chat/v1/product/plans");
    expect(plans.status()).toBe(200);

    const subscription = await anonymous.get("/chat/v1/product/subscription");
    expect(subscription.status()).toBe(401);
    await anonymous.dispose();
  });

  test("webhook rejects a payload it cannot trust", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const res = await anonymous.post("/chat/v1/product/stripe/webhook", {
      headers: { "Content-Type": "application/json" },
      data: { not: "a stripe event" },
    });
    // The smoke server runs with a webhook secret, so an unsigned payload is
    // refused outright rather than accepted-but-ignored.
    expect(res.status(), await res.text()).toBe(400);
    expect((await res.json()) as { error?: string }).toMatchObject({
      error: "invalid signature",
    });
    await anonymous.dispose();
  });
});
