/**
 * Matrix Client-Server client (bot user). Application Service is out of scope.
 * Path: src/lib/integrations/sovereign/matrix-client.ts
 */
import { createHmac, randomUUID } from "node:crypto";
import type { ChatPort, PortResult } from "../ports.js";

export interface MatrixClientConfig {
  baseUrl: string;
  accessToken?: string;
  roomId?: string;
  user?: string;
  password?: string;
  sharedSecret?: string;
}

export interface MatrixDeps {
  fetchImpl?: typeof fetch;
  txnId?: string;
}

const VERIFY_USER = "ooo-verify";

export function matrixConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MatrixClientConfig | null {
  const baseUrl = env.ORGOS_MATRIX_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    accessToken: env.ORGOS_MATRIX_ACCESS_TOKEN?.trim() || undefined,
    roomId: env.ORGOS_MATRIX_ROOM_ID?.trim() || undefined,
    user: env.ORGOS_MATRIX_USER?.trim() || VERIFY_USER,
    password: env.ORGOS_MATRIX_PASSWORD?.trim() || undefined,
    sharedSecret: env.ORGOS_MATRIX_SHARED_SECRET?.trim() || undefined,
  };
}

function clientUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/_matrix/client/v3${path}`;
}

export function matrixRegisterMac(secret: string, nonce: string, username: string, password: string): string {
  const mac = createHmac("sha1", secret);
  mac.update(nonce);
  mac.update("\0");
  mac.update(username);
  mac.update("\0");
  mac.update(password);
  mac.update("\0");
  mac.update("notadmin");
  return mac.digest("hex");
}

export async function sendMatrixMessage(
  config: MatrixClientConfig,
  text: string,
  deps: MatrixDeps = {},
): Promise<PortResult> {
  if (!text.trim()) return { ok: false, reason: "empty message" };
  if (!config.accessToken || !config.roomId) {
    return { ok: false, reason: "Matrix のトークンまたはルームが未設定です" };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const txnId = deps.txnId ?? randomUUID();
  const room = encodeURIComponent(config.roomId);
  const res = await fetchImpl(
    clientUrl(config.baseUrl, `/rooms/${room}/send/m.room.message/${txnId}`),
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ msgtype: "m.text", body: text }),
    },
  );
  if (!res.ok) return { ok: false, reason: `matrix_http_${res.status}` };
  return { ok: true, reason: "ok" };
}

export function matrixChatPort(config: MatrixClientConfig, deps: MatrixDeps = {}): ChatPort {
  return {
    provider: "matrix",
    async send(input) {
      if (input.dryRun) {
        return { ok: true, dryRun: true, reason: "dry_run — Matrix へは出していません" };
      }
      return sendMatrixMessage(
        { ...config, roomId: input.roomId ?? config.roomId },
        input.text,
        deps,
      );
    },
  };
}
