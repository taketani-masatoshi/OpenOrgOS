import type { ExternalFinanceTransaction } from "../../../schemas/finance/external-transaction.js";
import { ISO4217_CURRENCY_CODES, iso4217MinorUnit } from "../../../schemas/iso4217.js";
import { createHmac, timingSafeEqual } from "node:crypto";

export type Provider = "gmo-aozora" | "wise-business" | "upsider-card" | "stripe" | "paypal" | "paypay";
export type ProviderConfig = { provider: Provider; endpoint: string; token?: string; oauthAccessToken?: string; webhookSecret?: string };

export async function exchangeOAuthCode(input: { tokenEndpoint: string; clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  if (!input.tokenEndpoint.startsWith("https://")) throw new Error("OAuth token endpoint must use HTTPS");
  const body = new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri });
  const response = await fetch(input.tokenEndpoint, { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`OAuth token exchange failed: HTTP ${response.status}`);
  const value = await response.json() as Record<string, unknown>;
  if (typeof value.access_token !== "string") throw new Error("OAuth response did not contain access_token");
  return { access_token: value.access_token, refresh_token: typeof value.refresh_token === "string" ? value.refresh_token : undefined, expires_in: typeof value.expires_in === "number" ? value.expires_in : undefined };
}

export async function refreshOAuthToken(input: { tokenEndpoint: string; clientId: string; clientSecret: string; refreshToken: string }): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  if (!input.tokenEndpoint.startsWith("https://")) throw new Error("OAuth token endpoint must use HTTPS");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken });
  const response = await fetch(input.tokenEndpoint, { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`OAuth refresh failed: HTTP ${response.status}`);
  const value = await response.json() as Record<string, unknown>;
  if (typeof value.access_token !== "string") throw new Error("OAuth response did not contain access_token");
  return { access_token: value.access_token, refresh_token: typeof value.refresh_token === "string" ? value.refresh_token : undefined, expires_in: typeof value.expires_in === "number" ? value.expires_in : undefined };
}

export async function verifyPayPalWebhook(input: { verifyEndpoint: string; accessToken: string; webhookId: string; headers: Record<string, string | undefined>; body: string }): Promise<boolean> {
  if (!input.verifyEndpoint.startsWith("https://")) throw new Error("PayPal verify endpoint must use HTTPS");
  const response = await fetch(input.verifyEndpoint, { method: "POST", headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ auth_algo: input.headers["paypal-auth-algo"], cert_url: input.headers["paypal-cert-url"], transmission_id: input.headers["paypal-transmission-id"], transmission_sig: input.headers["paypal-transmission-sig"], transmission_time: input.headers["paypal-transmission-time"], webhook_id: input.webhookId, webhook_event: JSON.parse(input.body) }) });
  if (!response.ok) return false;
  const value = await response.json() as { verification_status?: string };
  return value.verification_status === "SUCCESS";
}

export async function simulateWiseSettlementFunds(input: { accessToken: string; amount: number; currency: string; paymentReference: string; baseUrl?: string }): Promise<void> {
  if (!/^BYOPSP_/.test(input.paymentReference)) throw new Error("Wise simulation paymentReference must start with BYOPSP_");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Wise simulation amount must be a positive finite number");
  if (!ISO4217_CURRENCY_CODES.has(input.currency)) throw new Error("Wise simulation currency must be a valid ISO 4217 code");
  if (!input.accessToken.trim()) throw new Error("Wise Sandbox access token is required");
  const baseUrl = input.baseUrl ?? "https://api.wise-sandbox.com";
  if (!baseUrl.startsWith("https://")) throw new Error("Wise Sandbox URL must use HTTPS");
  const response = await fetch(`${baseUrl}/v1/simulations/settlement/funds`, { method: "POST", headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ amount: input.amount, currency: input.currency, paymentReference: input.paymentReference }) });
  if (!response.ok) throw new Error(`Wise simulation failed: HTTP ${response.status}`);
}

export const SANDBOX_ENDPOINTS: Partial<Record<Provider, string>> = {
  "gmo-aozora": "https://api.sunabar.gmo-aozora.com",
  "wise-business": "https://api.wise-sandbox.com",
  "upsider-card": "https://sandbox.api.upsider.co.jp",
  paypay: "https://apigw.sandbox.paypay.ne.jp",
  paypal: "https://api-m.sandbox.paypal.com",
};

/**
 * Provider-neutral REST adapter. Provider-specific response mapping is injected
 * after the current provider documentation and account contract are verified.
 */
export async function fetchProviderTransactions(
  config: ProviderConfig,
  map: (payload: unknown, config: ProviderConfig) => ExternalFinanceTransaction[],
  init: RequestInit = {},
): Promise<ExternalFinanceTransaction[]> {
  if (!/^https:\/\//.test(config.endpoint)) throw new Error("External finance endpoint must use HTTPS");
  const headers = new Headers(init.headers);
  if (config.oauthAccessToken) headers.set("authorization", `Bearer ${config.oauthAccessToken}`);
  else if (config.token) headers.set("authorization", `Bearer ${config.token}`);
  const response = await fetch(config.endpoint, { ...init, headers });
  if (!response.ok) throw new Error(`External finance ${config.provider} request failed: HTTP ${response.status}`);
  return map(await response.json(), config);
}

export const PROVIDER_AUTH_MODES: Record<Provider, "oauth2" | "api-token" | "read-only-key" | "webhook-or-api"> = {
  "gmo-aozora": "oauth2",
  "wise-business": "api-token",
  "upsider-card": "read-only-key",
  stripe: "webhook-or-api",
  paypal: "webhook-or-api",
  paypay: "webhook-or-api",
};

export function verifyStripeSignature(rawBody: string, signature: string, secret: string, toleranceSeconds = 300): boolean {
  const values = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2))) as Record<string, string>;
  if (!values.t || !values.v1 || Math.abs(Date.now() / 1000 - Number(values.t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${values.t}.${rawBody}`).digest("hex");
  if (!/^[0-9a-f]{64}$/.test(values.v1)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(values.v1, "hex"));
}

export function mapStripePaymentEvent(payload: any, tenant_id: string): ExternalFinanceTransaction[] {
  const object = payload?.data?.object;
  if (!object || !payload?.id || !["payment_intent.succeeded", "charge.succeeded", "checkout.session.completed"].includes(payload.type)) return [];
  const amount = object.amount_received ?? object.amount_total ?? object.amount;
  const currency = String(object.currency ?? "").toUpperCase();
  if (!Number.isInteger(amount) || !currency) return [];
  const minor_unit = iso4217MinorUnit(currency) ?? 2;
  return [{ tenant_id, transaction_id: String(object.id ?? payload.id), source: "stripe", type: "INCOME", amount: String(amount / 10 ** minor_unit), currency, payer_or_payee: String(object.billing_details?.name ?? object.customer_details?.email ?? object.customer ?? "UNKNOWN"), transaction_date: new Date((payload.created ?? Date.now() / 1000) * 1000).toISOString(), direction: "CREDIT", minor_unit, raw_event_id: String(payload.id), metadata: { event_type: String(payload.type) } }];
}

export function mapPayPalCaptureEvent(payload: any, tenant_id: string): ExternalFinanceTransaction[] {
  const resource = payload?.resource;
  if (payload?.event_type !== "PAYMENT.CAPTURE.COMPLETED" || !resource?.id || !resource?.amount?.value) return [];
  return [{ tenant_id, transaction_id: String(resource.id), source: "paypal", type: "INCOME", amount: String(resource.amount.value), currency: String(resource.amount.currency_code).toUpperCase(), payer_or_payee: String(resource.payer?.email_address ?? resource.seller_protection?.status ?? "UNKNOWN"), transaction_date: String(payload.create_time ?? new Date().toISOString()), direction: "CREDIT", raw_event_id: String(payload.id ?? resource.id), metadata: { event_type: String(payload.event_type) } }];
}
