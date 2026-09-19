/**
 * Open-Xchange client. Live HTTP only after a public CE image probe succeeds.
 * Path: src/lib/integrations/sovereign/ox-client.ts
 */
import type { ConnectorInclusion } from "../../../../schemas/connectors.js";
import type { MailPort, PortResult } from "../ports.js";
import { STUB_DOES_NOT_LEAVE } from "../ports.js";

export interface OxConfig {
  baseUrl: string;
  user?: string;
  password?: string;
}

export function oxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OxConfig | null {
  const baseUrl = env.ORGOS_OX_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    user: env.ORGOS_OX_USER?.trim() || undefined,
    password: env.ORGOS_OX_PASSWORD?.trim() || undefined,
  };
}

export function oxStubResult(): PortResult {
  return {
    ok: false,
    reason: `Open-Xchange は公開 CE イメージが未確定です。${STUB_DOES_NOT_LEAVE}`,
  };
}

/** One authenticated call. Stub inclusion never touches the network. */
export async function pingOx(input: {
  inclusion: ConnectorInclusion;
  config?: OxConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<PortResult> {
  if (input.inclusion !== "confirmed_live") return oxStubResult();
  if (!input.config) return { ok: false, reason: "Open-Xchange の base URL が未設定です" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (input.config.user && input.config.password) {
    const token = Buffer.from(`${input.config.user}:${input.config.password}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }
  const res = await fetchImpl(`${input.config.baseUrl}/appsuite/api/health`, { headers });
  if (!res.ok) return { ok: false, reason: `ox_http_${res.status}` };
  return { ok: true, reason: "ok" };
}

export function oxMailPort(inclusion: ConnectorInclusion, config: OxConfig | null, fetchImpl?: typeof fetch): MailPort {
  return {
    provider: "ox",
    async ping() {
      return pingOx({ inclusion, config, fetchImpl });
    },
  };
}
