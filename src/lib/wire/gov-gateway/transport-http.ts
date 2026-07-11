import type { GovGatewayTransport, GovGatewayTransportResult } from "./types.js";

export class HttpGovGatewayTransport implements GovGatewayTransport {
  async post(
    url: string,
    headers: Record<string, string>,
    body: string | Uint8Array
  ): Promise<GovGatewayTransportResult> {
    const bodyInit: BodyInit =
      typeof body === "string" ? body : new Uint8Array(body).buffer;
    try {
      const parsed = new URL(url);
      let res: Response;
      if (parsed.protocol === "https:") {
        const { loadProtocolApiClientConfig } = await import("../../protocol/protocol-api-config.js");
        const { protocolFetch } = await import("../../protocol/protocol-tls.js");
        const client = loadProtocolApiClientConfig();
        res = await protocolFetch(url, {
          method: "POST",
          headers,
          body: bodyInit,
          tls: client.tls,
        });
      } else {
        res = await fetch(url, { method: "POST", headers, body: bodyInit });
      }
      const correlationId = res.headers.get("x-correlation-id") ?? res.headers.get("X-Road-Request-Id") ?? undefined;
      const nativeMessageId = res.headers.get("x-request-id") ?? res.headers.get("X-Request-Id") ?? undefined;
      if (!res.ok) {
        return {
          ok: false,
          http_status: res.status,
          correlation_id: correlationId ?? undefined,
          native_message_id: nativeMessageId ?? undefined,
          detail: `HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        http_status: res.status,
        correlation_id: correlationId ?? undefined,
        native_message_id: nativeMessageId ?? undefined,
        detail: "ok",
      };
    } catch (e) {
      return {
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

export type MockGovGatewayTransportOptions = {
  defaultOk?: boolean;
  defaultStatus?: number;
  responses?: Record<string, GovGatewayTransportResult>;
};

export class MockGovGatewayTransport implements GovGatewayTransport {
  readonly requests: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  private defaultOk: boolean;
  private defaultStatus: number;
  private responses: Record<string, GovGatewayTransportResult>;

  constructor(opts: MockGovGatewayTransportOptions = {}) {
    this.defaultOk = opts.defaultOk ?? true;
    this.defaultStatus = opts.defaultStatus ?? 200;
    this.responses = opts.responses ?? {};
  }

  async post(
    url: string,
    headers: Record<string, string>,
    body: string | Uint8Array
  ): Promise<GovGatewayTransportResult> {
    const bodyText = typeof body === "string" ? body : new TextDecoder().decode(body);
    this.requests.push({ url, headers, body: bodyText });
    const override = this.responses[url];
    if (override) return override;
    return {
      ok: this.defaultOk,
      http_status: this.defaultStatus,
      correlation_id: headers["X-Request-Id"] ?? headers["x-request-id"],
      native_message_id: headers["X-Request-Id"] ?? headers["x-request-id"],
      detail: this.defaultOk ? "mock-ok" : "mock-fail",
    };
  }
}

let defaultTransport: GovGatewayTransport | undefined;

/**
 * Resolve transport:
 * - GOV_GATEWAY_TRANSPORT=mock → always Mock (tests / CI)
 * - GOV_GATEWAY_TRANSPORT=live → Http (sandbox / production SS)
 * - default → Http (live) unless already injected
 */
export function createGovGatewayTransportFromEnv(): GovGatewayTransport {
  const mode = (process.env.GOV_GATEWAY_TRANSPORT ?? "live").toLowerCase();
  if (mode === "mock") {
    return new MockGovGatewayTransport({ defaultOk: true, defaultStatus: 200 });
  }
  return new HttpGovGatewayTransport();
}

export function getDefaultGovGatewayTransport(): GovGatewayTransport {
  if (!defaultTransport) {
    defaultTransport = createGovGatewayTransportFromEnv();
  }
  return defaultTransport;
}

export function setDefaultGovGatewayTransport(transport: GovGatewayTransport): void {
  defaultTransport = transport;
}

export function resetDefaultGovGatewayTransport(): void {
  defaultTransport = createGovGatewayTransportFromEnv();
}
