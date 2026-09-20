/**
 * Live verify against a running openDesk-shaped stack. L1 text only.
 * Path: src/lib/integrations/opendesk-verify.ts
 */
import { randomUUID } from "node:crypto";
import type { ConnectorInclusion } from "../../../schemas/connectors.js";
import { discoverKeycloak, keycloakConfigFromEnv } from "./sovereign/keycloak-oidc.js";
import {
  matrixConfigFromEnv,
  matrixRegisterMac,
  sendMatrixMessage,
  type MatrixClientConfig,
} from "./sovereign/matrix-client.js";
import {
  nextcloudConfigFromEnv,
  pingNextcloud,
  putNextcloudFile,
} from "./sovereign/nextcloud-webdav.js";
import { oxConfigFromEnv, pingOx } from "./sovereign/ox-client.js";
import type { PortResult } from "./ports.js";

export const OPENDESK_VERIFY_TEXT = "opendesk verify";
export const OPENDESK_VERIFY_PATH = "opendesk-verify/l1-note.txt";

export interface OpendeskVerifyReport {
  matrix: PortResult;
  nextcloud: PortResult;
  keycloak: PortResult;
  ox: PortResult;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function ensureMatrixToken(
  config: MatrixClientConfig,
  fetchImpl: typeof fetch,
): Promise<MatrixClientConfig> {
  if (config.accessToken && config.roomId) return config;
  let accessToken = config.accessToken;
  const user = config.user ?? "ooo-verify";
  const password = config.password;
  if (!accessToken && config.sharedSecret && password) {
    const nonceRes = await fetchImpl(`${config.baseUrl}/_synapse/admin/v1/register`);
    if (nonceRes.ok) {
      const nonceBody = await readJson(nonceRes);
      const nonce = String(nonceBody.nonce ?? "");
      const mac = matrixRegisterMac(config.sharedSecret, nonce, user, password);
      await fetchImpl(`${config.baseUrl}/_synapse/admin/v1/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce, username: user, password, admin: false, mac }),
      });
    }
  }
  if (!accessToken && password) {
    const login = await fetchImpl(`${config.baseUrl}/_matrix/client/v3/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password }),
    });
    if (login.ok) {
      const body = await readJson(login);
      accessToken = typeof body.access_token === "string" ? body.access_token : undefined;
    }
  }
  let roomId = config.roomId;
  if (accessToken && !roomId) {
    const room = await fetchImpl(`${config.baseUrl}/_matrix/client/v3/createRoom`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preset: "private_chat", name: "opendesk-verify" }),
    });
    if (room.ok) {
      const body = await readJson(room);
      roomId = typeof body.room_id === "string" ? body.room_id : undefined;
    }
  }
  return { ...config, accessToken, roomId };
}

export async function verifyOpendeskPorts(input: {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  oxInclusion: ConnectorInclusion;
  txnId?: string;
}): Promise<OpendeskVerifyReport> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const env = input.env ?? process.env;

  const matrixConfig = matrixConfigFromEnv(env);
  const matrix = matrixConfig
    ? await sendMatrixMessage(await ensureMatrixToken(matrixConfig, fetchImpl), OPENDESK_VERIFY_TEXT, {
        fetchImpl,
        txnId: input.txnId ?? randomUUID(),
      })
    : { ok: false, reason: "ORGOS_MATRIX_BASE_URL が未設定です" };

  const nextcloudConfig = nextcloudConfigFromEnv(env);
  let nextcloud: PortResult = { ok: false, reason: "ORGOS_NEXTCLOUD_BASE_URL が未設定です" };
  if (nextcloudConfig) {
    const ping = await pingNextcloud(nextcloudConfig, fetchImpl);
    nextcloud = ping.ok
      ? await putNextcloudFile(nextcloudConfig, OPENDESK_VERIFY_PATH, OPENDESK_VERIFY_TEXT, fetchImpl)
      : ping;
  }

  const keycloakConfig = keycloakConfigFromEnv(env);
  const keycloak = keycloakConfig
    ? await discoverKeycloak(keycloakConfig, fetchImpl)
    : { ok: false, reason: "ORGOS_KEYCLOAK_BASE_URL が未設定です" };

  const ox = await pingOx({
    inclusion: input.oxInclusion,
    config: oxConfigFromEnv(env),
    fetchImpl,
  });

  return { matrix, nextcloud, keycloak, ox };
}
