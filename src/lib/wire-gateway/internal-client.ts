import { readFileSync, existsSync } from "node:fs";
import type { WireGatewayConfig } from "../../../schemas/protocol/wire-gateway-config.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import {
  internalWireNodeResponseSchema,
  internalWirePeersResponseSchema,
  internalWireOutboxListSchema,
  internalWireOutboxEnvelopeSchema,
  internalWirePullResponseSchema,
  type InternalWireOutboxEntry,
  type InternalWirePeerEntry,
  type InternalWireInboxSubmit,
} from "../../../schemas/protocol/wire-gateway-internal.js";
import { wireInboundResultSchema, type WireDeliveryReceipt } from "../../../schemas/protocol/wire-message.js";
import { getTenantId } from "../tenant.js";

export interface WireInternalClientOptions {
  gatewayId?: string;
  tenantId?: string;
}

function resolveBearerToken(config: WireGatewayConfig): string | undefined {
  if (config.internal_api.bearer_token) {
    return config.internal_api.bearer_token;
  }
  const file = config.internal_api.bearer_token_file;
  if (file && existsSync(file)) {
    return readFileSync(file, "utf-8").trim();
  }
  return undefined;
}

export class WireInternalClient {
  private readonly baseUrl: string;
  private readonly bearerToken?: string;
  private readonly gatewayId?: string;
  private readonly tenantId?: string;

  constructor(config: WireGatewayConfig, options: WireInternalClientOptions = {}) {
    this.baseUrl = config.internal_api.base_url.replace(/\/$/, "");
    this.bearerToken = resolveBearerToken(config);
    this.gatewayId = options.gatewayId ?? config.node_id;
    this.tenantId = options.tenantId ?? getTenantId();
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.bearerToken) {
      h.Authorization = `Bearer ${this.bearerToken}`;
    }
    if (this.tenantId) {
      h["X-OrgOS-Tenant"] = this.tenantId;
    }
    if (this.gatewayId) {
      h["X-Wire-Gateway-Id"] = this.gatewayId;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<{ status: number; data: T }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { ...this.headers(), ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  async getNode() {
    const { status, data } = await this.request<unknown>("GET", "/node");
    if (status !== 200) {
      throw new Error(`internal GET /node failed: ${status}`);
    }
    return internalWireNodeResponseSchema.parse(data);
  }

  async getPeers(): Promise<InternalWirePeerEntry[]> {
    const { status, data } = await this.request<unknown>("GET", "/peers");
    if (status !== 200) {
      throw new Error(`internal GET /peers failed: ${status}`);
    }
    return internalWirePeersResponseSchema.parse(data).peers;
  }

  async listOutbox(): Promise<InternalWireOutboxEntry[]> {
    const { status, data } = await this.request<unknown>("GET", "/outbox");
    if (status !== 200) {
      throw new Error(`internal GET /outbox failed: ${status}`);
    }
    return internalWireOutboxListSchema.parse(data).pending;
  }

  async getOutboxEnvelope(eventId: string): Promise<EventEnvelope> {
    const { status, data } = await this.request<unknown>("GET", `/outbox/${eventId}`);
    if (status === 404) {
      throw new Error(`outbox envelope not found: ${eventId}`);
    }
    if (status !== 200) {
      throw new Error(`internal GET /outbox/${eventId} failed: ${status}`);
    }
    return internalWireOutboxEnvelopeSchema.parse(data).envelope;
  }

  async submitInbox(body: InternalWireInboxSubmit) {
    const { status, data } = await this.request<unknown>("POST", "/inbox", body);
    if (status !== 202 && status !== 409) {
      throw new Error(`internal POST /inbox failed: ${status}`);
    }
    return { status, result: wireInboundResultSchema.parse(data) };
  }

  async reportDelivered(eventId: string, receipt: WireDeliveryReceipt) {
    const { status, data } = await this.request<unknown>(
      "POST",
      `/outbox/${eventId}/delivered`,
      receipt
    );
    if (status !== 200) {
      throw new Error(`internal POST /outbox/${eventId}/delivered failed: ${status}`);
    }
    return data;
  }

  async getEventForPull(eventId: string, peerNodeId?: string) {
    const headers = peerNodeId ? { "X-Wire-Peer-Id": peerNodeId } : undefined;
    const { status, data } = await this.request<unknown>(
      "GET",
      `/events/${eventId}`,
      undefined,
      headers
    );
    if (status !== 200) {
      throw new Error(`internal GET /events/${eventId} failed: ${status}`);
    }
    return internalWirePullResponseSchema.parse(data);
  }
}
