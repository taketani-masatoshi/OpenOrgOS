import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../src/lib/protocol/signing.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  approveInterOrgNotice,
  proposeInterOrgNotice,
} from "../src/lib/wire/index.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";
import {
  getEmailWireEventConfirmation,
  listUnconfirmedEmailWireEvents,
} from "../src/lib/protocol/delivery-ledger.js";
import { scanMailReceivedForWire } from "../src/lib/protocol/email-wire-ingest.js";
import {
  getMailReceivedDir,
  getWireSentDir,
} from "../src/lib/correspondence/paths.js";
import { evaluateEmailWireReadiness } from "../src/lib/protocol/prod-wire-gate.js";

const TEST_TENANT = `test-email-wire-${process.pid}-${randomUUID().slice(0, 8)}`;

const MAIL_ENV_KEYS = [
  "ORGOS_SMTP_HOST",
  "ORGOS_SMTP_PORT",
  "ORGOS_SMTP_SECURE",
  "ORGOS_SMTP_USER",
  "ORGOS_SMTP_PASSWORD",
  "ORGOS_WIRE_SMTP_HOST",
  "ORGOS_WIRE_SMTP_PORT",
  "ORGOS_WIRE_SMTP_SECURE",
  "ORGOS_WIRE_SMTP_USER",
  "ORGOS_WIRE_SMTP_PASSWORD",
  "ORGOS_MAIL_FROM",
  "ORGOS_WIRE_MAIL_FROM",
] as const;

function removeTestTenant(): void {
  if (!/^test-email-wire-\d+-[a-f0-9]{8}$/.test(TEST_TENANT)) {
    throw new Error(`Refusing to remove non-test tenant: ${TEST_TENANT}`);
  }
  const tenantsDir = resolve(getTenantsDir());
  const tenantDir = resolve(tenantsDir, TEST_TENANT);
  if (dirname(tenantDir) !== tenantsDir) {
    throw new Error(`Refusing to remove tenant outside test root: ${tenantDir}`);
  }
  rmSync(tenantDir, { recursive: true, force: true });
}

describe("protocol email_wire approve-to-inbox roundtrip", () => {
  const savedMailEnv: Partial<Record<(typeof MAIL_ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of MAIL_ENV_KEYS) {
      savedMailEnv[key] = process.env[key];
      delete process.env[key];
    }
    const tenantDir = join(getTenantsDir(), TEST_TENANT);
    removeTestTenant();
    mkdirSync(join(tenantDir, "data", "contracts"), { recursive: true });
    mkdirSync(join(tenantDir, "records", "executive"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${TEST_TENANT}\nname: Email Wire roundtrip test\nlifecycle: test\njurisdiction: JP\n`,
      "utf-8"
    );
    copyFileSync(
      join(getTenantsDir(), "demo", "data", "company.yaml"),
      join(tenantDir, "data", "company.yaml")
    );
    writeFileSync(
      join(tenantDir, "data", "contracts", "CTR-905.yaml"),
      `id: CTR-905
name: R5 roundtrip
counterparty: Peer Co
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 50000
`,
      "utf-8"
    );
    writeFileSync(
      join(tenantDir, "records", "executive", "mail-config.yaml"),
      `provider: dry_run
from:
  name: Test Secretary
  email: secretary@roundtrip.test
receive:
  sync: imap
  imap_host: imap.roundtrip.test
  auto_wire_scan: true
wire_outbound:
  enabled: true
  from:
    name: Test Wire
    email: wire@roundtrip.test
  max_per_hour: 10
`,
      "utf-8"
    );
    setTenantId(TEST_TENANT);
    process.env.STEWARD_SKIP_DELIVER_VALIDATE = "1";
  });

  afterEach(() => {
    delete process.env.STEWARD_SKIP_DELIVER_VALIDATE;
    for (const key of MAIL_ENV_KEYS) {
      if (savedMailEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedMailEnv[key];
    }
    setTenantId("demo");
    removeTestTenant();
  });

  it("approves, dry-run delivers, scans, ingests, and confirms one event", async () => {
    ensureProtocolSigningKey();
    const protocolPublicKey = exportProtocolPublicKeyBase64();
    registerPeer({
      peer_id: "PEER-905",
      display_name: "Roundtrip Peer",
      jurisdiction: "JP",
      org_uri: `steward://tenant/${TEST_TENANT}`,
      protocol_public_key: protocolPublicKey,
      wire_email: "peer-wire@roundtrip.test",
      inbound_endpoints: [
        {
          url: "smtp://peer-wire@roundtrip.test",
          transport: "email_wire",
          priority: 10,
          mode: "push",
        },
      ],
    });

    expect(evaluateEmailWireReadiness(TEST_TENANT)).toMatchObject({ ok: true });

    const notice = proposeInterOrgNotice({
      peerId: "PEER-905",
      contractId: "CTR-905",
      proposedBy: "operator",
    });
    const approved = approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      eventId: "77777777-7777-4777-8777-777777777777",
    });
    const eventId = approved.transmission.envelope.event_id;

    const delivery = await deliverProtocolEnvelope(
      approved.transmission.envelope,
      "PEER-905"
    );
    expect(delivery).toMatchObject({ delivered: true, reason: "dry_run" });
    expect(getEmailWireEventConfirmation(eventId).state).toBe(
      "awaiting_inbound_confirmation"
    );
    expect(
      listUnconfirmedEmailWireEvents().map((entry) => entry.event_id)
    ).toContain(eventId);

    const sentPath = join(getWireSentDir(), `${eventId}.eml`);
    expect(existsSync(sentPath)).toBe(true);
    mkdirSync(getMailReceivedDir(), { recursive: true });
    copyFileSync(sentPath, join(getMailReceivedDir(), `${eventId}.eml`));

    const scan = await scanMailReceivedForWire();
    expect(scan).toMatchObject({ scanned: 1, ingested: 1, errors: [] });
    expect(
      existsSync(join(getDocsDir(), "protocol", "inbox", `${eventId}.json`))
    ).toBe(true);
    expect(getEmailWireEventConfirmation(eventId)).toMatchObject({
      event_id: eventId,
      state: "confirmed",
    });
    expect(listUnconfirmedEmailWireEvents()).toHaveLength(0);
  });

  it("fails readiness when outbound or automatic inbound ingest is disabled", () => {
    writeFileSync(
      join(
        getTenantsDir(),
        TEST_TENANT,
        "records",
        "executive",
        "mail-config.yaml"
      ),
      `provider: dry_run
from:
  name: Test Secretary
  email: secretary@roundtrip.test
receive:
  sync: stub
wire_outbound:
  enabled: false
  from:
    name: Test Wire
    email: wire@roundtrip.test
`,
      "utf-8"
    );
    const readiness = evaluateEmailWireReadiness(TEST_TENANT);
    expect(readiness.ok).toBe(false);
    expect(readiness.issues).toContain("wire_outbound.enabled must be true");
    expect(readiness.issues).toContain(
      "receive sync must be imap/gmail_api with auto_wire_scan enabled for inbound ingest"
    );
  });
});
