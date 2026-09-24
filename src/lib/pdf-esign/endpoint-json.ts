/**
 * JSON POST to a national eID endpoint (SiVa · digidoc4j sidecar) with a timeout.
 * Path: src/lib/pdf-esign/endpoint-json.ts
 *
 * Failure reasons are prefixed with the endpoint kind so the ledger shows
 * which hop failed (e.g. `siva_timeout`, `sidecar_non_json_502`).
 */
import type { EsignEndpointKind } from "./digidoc-runtime.js";

export type EndpointJsonResponse =
  | { ok: true; status: number; httpOk: boolean; body: unknown }
  | { ok: false; reason: string };

export async function postEndpointJson(input: {
  kind: EsignEndpointKind;
  url: string;
  headers: Record<string, string>;
  payload: unknown;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<EndpointJsonResponse> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), input.timeoutMs);
  let res: Response;
  try {
    res = await input.fetchImpl(input.url, {
      method: "POST",
      headers: input.headers,
      body: JSON.stringify(input.payload),
      signal: ac.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: msg.includes("abort")
        ? `${input.kind}_timeout`
        : `${input.kind}_unreachable: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  try {
    return {
      ok: true,
      status: res.status,
      httpOk: res.ok,
      body: text ? JSON.parse(text) : {},
    };
  } catch {
    return { ok: false, reason: `${input.kind}_non_json_${res.status}` };
  }
}
