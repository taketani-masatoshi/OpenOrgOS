/**
 * X-Road native REST producer — trust, decode, notice-ack, wrap compatibility.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir, ROOT_DIR } from "../src/lib/utils.js";
import {
  ensureProtocolSigningKey,
  maybeSignEnvelope,
} from "../src/lib/protocol/signing.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";
import {
  buildXRoadR1Path,
  decodeGovGatewayInbound,
  parseXRoadInboundBody,
  resolveXRoadDeliverUrl,
  startGovGatewayProducerServer,
  OPENORGOS_ENVELOPE_MIME,
} from "../src/lib/wire/gov-gateway/index.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function loadFixtureEnvelope() {
  const raw = JSON.parse(
    readFileSync(join(ROOT_DIR, "tests/fixtures/gov-gateway/shared-envelope.json"), "utf-8"),
  );
  return maybeSignEnvelope(eventEnvelopeSchema.parse(raw));
}

describe("xroad producer / native ingest", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    ensureProtocolSigningKey();
    writeFileSync(
      join(getDataDir(), "protocol", "gov-gateway.yaml"),
      `enabled: true
default_profile: xroad_v7
trusted_xroad_clients:
  - PLAYGROUND/COM/1234567-8/TestClient
profiles:
  - profile_id: xroad_v7
    enabled: true
    adapter_ref: steward/jurisdiction-packs/EE/protocol/xroad-adapter.profile.yaml
    member_code: EE/DEV/OPENORGOS
    subsystem_code: wire
    service_code: EE/DEV/OPENORGOS/wire/notice-deliver
    security_server_url: https://ss.example.ee
`,
      "utf-8",
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("builds /r1 paths and resolves relative deliver URLs", () => {
    expect(buildXRoadR1Path({ serviceCode: "EE/COM/P/wire/notice-deliver" })).toBe(
      "/r1/EE/COM/P/wire/notice-deliver",
    );
    expect(
      resolveXRoadDeliverUrl({
        peerUrl: "EE/COM/P/wire/notice-deliver",
        securityServerUrl: "https://ss.example.ee/",
      }),
    ).toBe("https://ss.example.ee/r1/EE/COM/P/wire/notice-deliver");
    expect(
      resolveXRoadDeliverUrl({
        peerUrl: "https://ss.example.ee/r1/already",
        securityServerUrl: "https://ignored.example",
      }),
    ).toBe("https://ss.example.ee/r1/already");
  });

  it("parses wrapped and native X-Road inbound bodies", () => {
    const envelope = loadFixtureEnvelope();
    const body = JSON.stringify(envelope);
    const wrapped = parseXRoadInboundBody({
      format: "gov_gateway",
      profile_id: "xroad_v7",
      headers: { "X-Request-Id": envelope.event_id },
      body,
    });
    expect(wrapped?.profile_id).toBe("xroad_v7");

    const native = parseXRoadInboundBody({
      headers: {
        "X-Road-Client": "PLAYGROUND/COM/1234567-8/TestClient",
        "X-Road-Service": "EE/DEV/OPENORGOS/wire/notice-deliver",
        "X-Request-Id": envelope.event_id,
      },
      body,
    });
    expect(native?.headers["X-Road-Client"]).toContain("PLAYGROUND");
  });

  it("keeps wrapped ingest decode working", async () => {
    const envelope = loadFixtureEnvelope();
    const decoded = await decodeGovGatewayInbound(
      {
        format: "gov_gateway",
        profile_id: "xroad_v7",
        headers: { "X-Request-Id": envelope.event_id },
        body: JSON.stringify(envelope),
      },
      "demo",
    );
    expect(decoded.ok).toBe(true);
    expect(decoded.envelope?.event_id).toBe(envelope.event_id);
  });

  it("producer accepts trusted client and returns notice-ack", async () => {
    const envelope = loadFixtureEnvelope();
    const handle = await startGovGatewayProducerServer({
      host: "127.0.0.1",
      port: 0,
      profileId: "xroad_v7",
    });
    try {
      const res = await fetch(`${handle.url}/r1/EE/DEV/OPENORGOS/wire/notice-deliver`, {
        method: "POST",
        headers: {
          "Content-Type": OPENORGOS_ENVELOPE_MIME,
          "X-Road-Client": "PLAYGROUND/COM/1234567-8/TestClient",
          "X-Road-Service": "EE/DEV/OPENORGOS/wire/notice-deliver",
          "X-Request-Id": envelope.event_id,
        },
        body: JSON.stringify(envelope),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("openorgos.envelope");
      const ack = eventEnvelopeSchema.parse(await res.json());
      expect(ack.event.type).toBe("steward.notice.ack");
      expect(ack.correlation_id).toBe(envelope.event_id);
    } finally {
      handle.close();
    }
  });

  it("producer rejects unknown X-Road-Client with 403", async () => {
    const envelope = loadFixtureEnvelope();
    const handle = await startGovGatewayProducerServer({
      host: "127.0.0.1",
      port: 0,
      profileId: "xroad_v7",
    });
    try {
      const res = await fetch(`${handle.url}/protocol/v1/gov-gateway/producer/notice-deliver`, {
        method: "POST",
        headers: {
          "Content-Type": OPENORGOS_ENVELOPE_MIME,
          "X-Road-Client": "EE/COM/UNKNOWN/evil",
          "X-Request-Id": envelope.event_id,
        },
        body: JSON.stringify(envelope),
      });
      expect(res.status).toBe(403);
    } finally {
      handle.close();
    }
  });

  it("producer rejects broken MIME with 422 and does not require trust-all", async () => {
    const handle = await startGovGatewayProducerServer({
      host: "127.0.0.1",
      port: 0,
      profileId: "xroad_v7",
      trustAllClients: true,
    });
    try {
      const res = await fetch(`${handle.url}/r1/EE/DEV/OPENORGOS/wire/notice-deliver`, {
        method: "POST",
        headers: {
          "Content-Type": OPENORGOS_ENVELOPE_MIME,
          "X-Road-Client": "anyone",
          "X-Request-Id": "not-a-uuid-body",
        },
        body: "{not-json",
      });
      expect(res.status).toBe(422);
    } finally {
      handle.close();
    }
  });
});
