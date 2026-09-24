import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import type { ReceiptQrData, SignedReceiptQrPayload } from "../schemas/receipt-qr.js";

const wire = vi.hoisted(() => ({
  proposals: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  rejections: [] as Array<Record<string, unknown>>,
  claimedEventId: "",
}));

vi.mock("../src/lib/wire/notice-workflow.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  bridgeProposeReceiptClaimed: (options: Record<string, unknown>) => {
    wire.proposals.push(options);
    return { notice_id: `NOTICE-20260924-${String(wire.proposals.length).padStart(3, "0")}` };
  },
  approveInterOrgNotice: (options: Record<string, unknown>) => {
    wire.approvals.push(options);
    return { transmission: { envelope: { event_id: wire.claimedEventId } } };
  },
  rejectInterOrgNotice: (options: Record<string, unknown>) => {
    wire.rejections.push(options);
    return {};
  },
}));

vi.mock("../src/lib/protocol/peers.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findPeer: (peerId: string) =>
    peerId.startsWith("PEER-00") ? { peer_id: peerId, org_id: `org:${peerId}` } : undefined,
}));

const receipts = await import("../src/lib/receipt-qr.js");

const CLAIM_BASE = "http://127.0.0.1:8787/wire/v1/receipts/claim";

function issueInput(overrides: Record<string, unknown> = {}) {
  return {
    document_type: "qualified_invoice" as const,
    transaction_date: "2026-09-01",
    recipient_name: "取引先株式会社",
    lines: [
      {
        description: "顧問料",
        tax_rate: 10 as const,
        amount_excluding_tax: 10_000,
        tax_amount: 1_000,
        amount_including_tax: 11_000,
      },
    ],
    claim_endpoint: CLAIM_BASE,
    ...overrides,
  };
}

function sampleReceipt(overrides: Partial<ReceiptQrData> = {}): ReceiptQrData {
  return {
    schema: "orgos.jp.receipt.v1",
    receipt_id: "RCPT-20260901-001",
    document_type: "qualified_simplified_invoice",
    issued_at: "2026-09-01T03:00:00.000Z",
    transaction_date: "2026-09-01",
    currency: "JPY",
    issuer: {
      org_id: "org:issuer",
      name: "発行商事",
      invoice_registration_number: "T1234567890123",
    },
    lines: [
      {
        description: "文具",
        quantity: 2,
        tax_rate: 8,
        reduced_tax: true,
        amount_excluding_tax: 1000,
        tax_amount: 80,
        amount_including_tax: 1080,
      },
    ],
    tax_totals: [
      { tax_rate: 8, amount_excluding_tax: 1000, tax_amount: 80, amount_including_tax: 1080 },
    ],
    total_amount: 1080,
    claim: { endpoint: "https://issuer.test/wire/v1/receipts/claim", claim_key: "c".repeat(32) },
    ...overrides,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function localYmd(date = new Date()): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("receipt-qr lifecycle — characterization", () => {
  let backup = "";
  let hadReceiptDir = false;
  const receiptDir = () => join(getDataDir(), "receipt-qr");

  beforeAll(() => {
    setTenantId("mal");
    backup = mkdtempSync(join(tmpdir(), "orgos-receipt-backup-"));
    hadReceiptDir = existsSync(receiptDir());
    if (hadReceiptDir) cpSync(receiptDir(), backup, { recursive: true });
  });

  afterAll(() => {
    setTenantId("mal");
    rmSync(receiptDir(), { recursive: true, force: true });
    if (hadReceiptDir) cpSync(backup, receiptDir(), { recursive: true });
    rmSync(backup, { recursive: true, force: true });
  });

  beforeEach(() => {
    setTenantId("mal");
    rmSync(receiptDir(), { recursive: true, force: true });
    wire.proposals.length = 0;
    wire.approvals.length = 0;
    wire.rejections.length = 0;
    wire.claimedEventId = randomUUID();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function initConfig(overrides: Record<string, unknown> = {}): string {
    return receipts.initReceiptQrConfig({ claim_base_url: `${CLAIM_BASE}/`, ...overrides });
  }

  describe("config", () => {
    it("writes a 0600 config with trimmed claim base and defaults", () => {
      const path = initConfig();
      expect(path).toBe(join(receiptDir(), "config.yaml"));
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(YAML.parse(readFileSync(path, "utf-8"))).toStrictEqual({
        schema: "orgos.jp.receipt.config.v1",
        claim_base_url: CLAIM_BASE,
        receipt_portal_url: "https://receipt.oorgos.org/r",
        simple_invoice_eligible: false,
        tax_rounding: "floor",
      });
      expect(() => initConfig()).toThrowError(
        new Error(`Receipt QR config already exists: ${path}`),
      );
      expect(receipts.loadReceiptQrConfig().claim_base_url).toBe(CLAIM_BASE);
      expect(receipts.receiptPortalUrl()).toBe("https://receipt.oorgos.org/r");
    });

    it("falls back to preview defaults without writing", () => {
      expect(receipts.loadReceiptConfigOrDefault()).toStrictEqual(
        receipts.defaultReceiptQrConfig(),
      );
      expect(() => receipts.loadReceiptQrConfig()).toThrowError(
        new Error(`Receipt QR config not found: ${join(receiptDir(), "config.yaml")}`),
      );
      expect(existsSync(receiptDir())).toBe(false);
    });
  });

  describe("issueReceipt", () => {
    it("refuses to persist before config exists", () => {
      expect(() => receipts.issueReceipt(issueInput())).toThrowError(
        new Error(`Receipt QR config not found: ${join(receiptDir(), "config.yaml")}`),
      );
    });

    it("previews with a random sequence and writes nothing", () => {
      const result = receipts.issueReceipt(issueInput(), { persist: false });
      expect(result.stored.receipt.receipt_id).toMatch(
        new RegExp(`^RCPT-${localYmd()}-[1-9]\\d{2}$`),
      );
      expect(existsSync(receiptDir())).toBe(false);
    });

    it("persists sequential receipts with registry, event and issued payload", () => {
      initConfig();
      const first = receipts.issueReceipt(issueInput());
      const second = receipts.issueReceipt(issueInput());
      expect(first.stored.receipt.receipt_id).toBe(`RCPT-${localYmd()}-001`);
      expect(second.stored.receipt.receipt_id).toBe(`RCPT-${localYmd()}-002`);

      const claimKey = first.qrPayload.receipt.claim!.claim_key;
      expect(claimKey).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(first.stored.claim_key_hash).toBe(sha256(claimKey));
      expect(first.stored.claim_status).toBe("unclaimed");
      expect(first.stored.receipt).not.toHaveProperty("claim");
      expect(first.stored.receipt.total_amount).toBe(11_000);
      expect(first.stored.receipt.tax_totals).toStrictEqual([
        { tax_rate: 10, amount_excluding_tax: 10_000, tax_amount: 1_000, amount_including_tax: 11_000 },
      ]);
      expect(first.stored.receipt.issuer).toMatchObject({
        name: "株式会社MAL",
        invoice_registration_number: "T4010001189530",
      });

      const registryPath = receipts.receiptRegistryPath();
      expect(registryPath).toBe(join(receiptDir(), "receipts.yaml"));
      expect(statSync(registryPath).mode & 0o777).toBe(0o600);
      const raw = JSON.parse(readFileSync(registryPath, "utf-8")) as {
        as_of: string;
        receipts: unknown[];
      };
      expect(raw.receipts).toHaveLength(2);
      expect(raw.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(receipts.loadReceiptRegistry().receipts[0]).toStrictEqual(first.stored);
      expect(receipts.findStoredReceipt(second.stored.receipt.receipt_id)).toStrictEqual(
        second.stored,
      );
      expect(existsSync(join(receiptDir(), "receipts.yaml.lock"))).toBe(false);

      const eventPath = join(receiptDir(), "events", `${first.stored.issued_event_id}.json`);
      const event = JSON.parse(readFileSync(eventPath, "utf-8")) as SignedEnvelopeLike;
      expect(event).toStrictEqual(JSON.parse(JSON.stringify(first.issuedEnvelope)));
      expect(event.event).toStrictEqual({
        type: "steward.receipt.issued",
        payload: {
          receipt_id: first.stored.receipt.receipt_id,
          receipt_digest: first.stored.digest,
          document_type: "qualified_invoice",
        },
      });

      const issuedPath = join(receiptDir(), "issued", `${first.stored.receipt.receipt_id}.json`);
      expect(statSync(issuedPath).mode & 0o777).toBe(0o600);
      expect(receipts.loadIssuedReceiptPayload(first.stored.receipt.receipt_id)).toStrictEqual(
        first.qrPayload,
      );
      expect(receipts.validateReceiptRegistryIntegrity()).toStrictEqual([]);
    });

    it("enforces claim base, recipient and simplified-invoice eligibility", () => {
      initConfig();
      expect(() =>
        receipts.issueReceipt(issueInput({ claim_endpoint: "https://elsewhere.test/claim" })),
      ).toThrowError(new Error("claim_endpoint must be under the configured claim_base_url"));
      expect(() =>
        receipts.issueReceipt(issueInput({ recipient_name: undefined })),
      ).toThrowError(new Error("qualified_invoice requires recipient_name"));
      expect(() =>
        receipts.issueReceipt(issueInput({ document_type: "qualified_simplified_invoice" })),
      ).toThrowError(
        new Error("qualified_simplified_invoice is disabled: issuer eligibility is not configured"),
      );
    });

    it("parses issue input files as JSON or YAML", () => {
      const dir = mkdtempSync(join(tmpdir(), "orgos-receipt-input-"));
      const jsonPath = join(dir, "input.json");
      const yamlPath = join(dir, "input.yaml");
      writeFileSync(jsonPath, JSON.stringify(issueInput()));
      writeFileSync(yamlPath, YAML.stringify(issueInput()));
      expect(receipts.parseReceiptIssueInputFile(jsonPath)).toStrictEqual(
        receipts.parseReceiptIssueInputFile(yamlPath),
      );
      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe("signed payload store", () => {
    it("saves and loads verified claimant snapshots", () => {
      const payload = receipts.signReceiptForTests(sampleReceipt());
      const relative = receipts.saveVerifiedReceiptSnapshot(payload);
      expect(relative).toBe("receipt-qr/snapshots/RCPT-20260901-001.json");
      expect(receipts.receiptSnapshotDir()).toBe(join(receiptDir(), "snapshots"));
      expect(receipts.loadReceiptSnapshot(relative)).toStrictEqual(payload);
      expect(receipts.loadReceiptSnapshot("receipt-qr/snapshots/none.json")).toBeUndefined();
      expect(() =>
        receipts.saveVerifiedReceiptSnapshot({ ...payload, digest: "0".repeat(64) }),
      ).toThrowError(new Error("Receipt verification failed: digest_mismatch"));
      expect(() =>
        receipts.saveIssuedReceiptPayload({ ...payload, digest: "0".repeat(64) }),
      ).toThrowError(new Error("Issued receipt invalid: digest_mismatch"));
    });

    it("prefers the issued payload for PDFs and falls back to the snapshot", () => {
      const payload = receipts.signReceiptForTests(sampleReceipt());
      expect(() => receipts.loadSignedReceiptForPdf("RCPT-20260901-001")).toThrowError(
        new Error("Signed receipt payload not found for RCPT-20260901-001 (issued or snapshot)"),
      );
      receipts.saveVerifiedReceiptSnapshot(payload);
      expect(receipts.loadSignedReceiptForPdf("RCPT-20260901-001")).toStrictEqual(payload);
      const issued = receipts.signReceiptForTests(sampleReceipt({ total_amount: 1080 }));
      expect(receipts.saveIssuedReceiptPayload(issued)).toBe(
        "receipt-qr/issued/RCPT-20260901-001.json",
      );
      expect(receipts.loadSignedReceiptForPdf("RCPT-20260901-001")).toStrictEqual(issued);
    });
  });

  describe("registry integrity", () => {
    it("warns about missing issued payloads and flags duplicates", () => {
      expect(receipts.validateReceiptRegistryIntegrity()).toStrictEqual([]);
      initConfig();
      const { stored } = receipts.issueReceipt(issueInput());
      const id = stored.receipt.receipt_id;
      unlinkSync(join(receiptDir(), "issued", `${id}.json`));
      writeFileSync(
        receipts.receiptRegistryPath(),
        JSON.stringify({ receipts: [stored, stored] }),
      );
      expect(receipts.validateReceiptRegistryIntegrity()).toStrictEqual([
        {
          level: "warning",
          file: "data/receipt-qr/receipts.yaml",
          message: `${id}: issued payload missing (PDF regenerate may fail)`,
        },
        {
          level: "error",
          file: "data/receipt-qr/receipts.yaml",
          message: `duplicate receipt_id ${id}`,
        },
        {
          level: "warning",
          file: "data/receipt-qr/receipts.yaml",
          message: `${id}: issued payload missing (PDF regenerate may fail)`,
        },
      ]);
    });
  });

  describe("claim approval flow", () => {
    function issueForClaim() {
      initConfig();
      return receipts.issueReceipt(issueInput());
    }

    function claim(
      issued: ReturnType<typeof issueForClaim>,
      overrides: Record<string, unknown> = {},
    ) {
      return receipts.claimReceipt({
        receiptId: issued.stored.receipt.receipt_id,
        claimKey: issued.qrPayload.receipt.claim!.claim_key,
        claimantPeerId: "PEER-001",
        claimantOrgId: "org:claimant",
        proposedBy: "wire:org:claimant",
        requestEventId: "11111111-1111-4111-8111-111111111111",
        receiptDigest: issued.stored.digest,
        ...overrides,
      });
    }

    it("guards peer, receipt, digest and claim key", () => {
      const issued = issueForClaim();
      expect(() => claim(issued, { claimantPeerId: "PEER-999" })).toThrowError(
        new Error("Peer PEER-999 not registered"),
      );
      expect(() => claim(issued, { receiptId: "RCPT-19990101-001" })).toThrowError(
        new Error("Receipt not found: RCPT-19990101-001"),
      );
      expect(() => claim(issued, { receiptDigest: "0".repeat(64) })).toThrowError(
        new Error("Receipt digest mismatch"),
      );
      expect(() => claim(issued, { claimKey: "wrong" })).toThrowError(
        new Error("Invalid receipt claim key"),
      );
      expect(wire.proposals).toHaveLength(0);
    });

    it("proposes, is idempotent for the same OOO and rejects another OOO", () => {
      const issued = issueForClaim();
      const id = issued.stored.receipt.receipt_id;
      const first = claim(issued);
      expect(first.idempotent).toBe(false);
      expect(first.approvalId).toBe("NOTICE-20260924-001");
      expect(first.receipt).toMatchObject({
        claim_status: "claim_pending_approval",
        claimed_by_org_id: "org:claimant",
        claimed_by_peer_id: "PEER-001",
        claim_approval_id: "NOTICE-20260924-001",
      });
      expect(wire.proposals).toStrictEqual([
        {
          peerId: "PEER-001",
          receiptId: id,
          receiptDigest: issued.stored.digest,
          proposedBy: "wire:org:claimant",
          correlationEventId: "11111111-1111-4111-8111-111111111111",
          message: `領収書 ${id} claim · digest ${issued.stored.digest}`,
        },
      ]);
      expect(receipts.findStoredReceipt(id)).toStrictEqual(first.receipt);

      const again = claim(issued);
      expect(again).toStrictEqual({
        receipt: first.receipt,
        approvalId: "NOTICE-20260924-001",
        idempotent: true,
      });
      expect(() => claim(issued, { claimantOrgId: "org:other" })).toThrowError(
        new Error("Receipt claim key has already been consumed by another OOO"),
      );
    });

    it("approves a pending claim exactly once", () => {
      const issued = issueForClaim();
      const id = issued.stored.receipt.receipt_id;
      expect(() => receipts.approveReceiptClaim({ receiptId: id, approverId: "CEO" })).toThrowError(
        new Error("Receipt has no pending claim approval"),
      );
      claim(issued);
      const approved = receipts.approveReceiptClaim({
        receiptId: id,
        approverId: "CEO",
        operatorId: "OP-001",
      });
      expect(wire.approvals).toStrictEqual([
        { noticeId: "NOTICE-20260924-001", approverId: "CEO", operatorId: "OP-001" },
      ]);
      expect(approved).toMatchObject({
        claim_status: "claimed",
        claimed_event_id: wire.claimedEventId,
      });
      expect(approved.claimed_at).toBeTruthy();
      expect(() => receipts.approveReceiptClaim({ receiptId: id, approverId: "CEO" })).toThrowError(
        new Error("Receipt claim is not pending approval (status=claimed)"),
      );
    });

    it("rejects a pending claim with a reason", () => {
      const issued = issueForClaim();
      const id = issued.stored.receipt.receipt_id;
      expect(() =>
        receipts.rejectReceiptClaim({ receiptId: id, approverId: "CEO", reason: "  " }),
      ).toThrowError(new Error("Reject reason is required"));
      expect(() =>
        receipts.rejectReceiptClaim({ receiptId: id, approverId: "CEO", reason: "dup" }),
      ).toThrowError(new Error("Receipt has no pending claim approval"));
      claim(issued);
      const rejected = receipts.rejectReceiptClaim({
        receiptId: id,
        approverId: "CEO",
        reason: " duplicate ",
      });
      expect(wire.rejections).toStrictEqual([
        { noticeId: "NOTICE-20260924-001", approverId: "CEO", reason: "duplicate" },
      ]);
      expect(rejected).toMatchObject({
        claim_status: "claim_rejected",
        claim_reject_reason: "duplicate",
        claim_rejected_by: "CEO",
      });
      expect(rejected.claim_rejected_at).toBeTruthy();
    });
  });

  describe("claimant transport", () => {
    it("fetches signed receipts only over HTTPS or localhost", async () => {
      const payload = receipts.signReceiptForTests(sampleReceipt());
      await expect(
        receipts.fetchSignedReceiptOnline("http://issuer.example/r/1", async () => jsonResponse(payload)),
      ).rejects.toThrowError(
        new Error("Receipt fetch requires HTTPS (HTTP allowed only for localhost demo)"),
      );
      await expect(
        receipts.fetchSignedReceiptOnline("http://localhost:8787/r/1", async () => jsonResponse(payload)),
      ).resolves.toStrictEqual(payload);
      await expect(
        receipts.fetchSignedReceiptOnline("https://issuer.test/r/1", async () => jsonResponse({}, 500)),
      ).rejects.toThrowError(new Error("Receipt fetch failed: HTTP 500"));
      await expect(
        receipts.fetchSignedReceiptOnline("https://issuer.test/r/1", async () => jsonResponse({})),
      ).rejects.toThrowError(new Error("Fetched receipt invalid: schema_invalid"));
    });

    it("ingests links and JSON, re-fetching when fetch_url is present", async () => {
      const payload = receipts.signReceiptForTests(sampleReceipt());
      const fromLink = await receipts.ingestReceiptQrPayload(receipts.encodeReceiptLink(payload));
      expect(fromLink).toEqual({
        payload,
        snapshot_path: "receipt-qr/snapshots/RCPT-20260901-001.json",
      });
      const fromJson = await receipts.ingestReceiptQrPayload(`  ${JSON.stringify(payload)} `);
      expect(fromJson.payload).toStrictEqual(payload);

      const online = receipts.signReceiptForTests(
        sampleReceipt({ receipt_id: "RCPT-20260901-002" }),
      );
      const pointer = receipts.signReceiptForTests(
        sampleReceipt({ receipt_id: "RCPT-20260901-002", fetch_url: "https://issuer.test/r/2" }),
      );
      const fetched: string[] = [];
      const result = await receipts.ingestReceiptQrPayload(
        receipts.encodeReceiptLink(pointer),
        async (url) => {
          fetched.push(String(url));
          return jsonResponse(online);
        },
      );
      expect(fetched).toStrictEqual(["https://issuer.test/r/2"]);
      expect(result.payload).toStrictEqual(online);

      await expect(receipts.ingestReceiptQrPayload("not a receipt")).rejects.toThrowError(
        new Error(
          "Signed receipt payload required (QR link or JSON). Unsigned manual draft is disabled by default.",
        ),
      );
    });

    it("claims remotely with an amount-free signed envelope", async () => {
      initConfig();
      const { qrPayload } = receipts.issueReceipt(issueInput());
      const sent: Array<{ url: string; body: SignedEnvelopeLike }> = [];
      const result = await receipts.claimReceiptRemotely(qrPayload, async (url, init) => {
        sent.push({ url: String(url), body: JSON.parse(String(init?.body)) as SignedEnvelopeLike });
        return jsonResponse({ ok: true, status: "claim_pending_approval" }, 202);
      });
      expect(sent[0]!.url).toBe(CLAIM_BASE);
      const envelope = sent[0]!.body;
      expect(envelope.event).toStrictEqual({
        type: "steward.receipt.claim.requested",
        payload: {
          receipt_id: qrPayload.receipt.receipt_id,
          receipt_digest: qrPayload.digest,
          claim_key: qrPayload.receipt.claim!.claim_key,
        },
      });
      expect(envelope.destination).toStrictEqual({ org_id: qrPayload.receipt.issuer.org_id });
      expect(envelope.signature).toBeTruthy();
      expect(result).toStrictEqual({
        status: 202,
        body: { ok: true, status: "claim_pending_approval" },
        event_id: envelope.event_id,
      });

      const broken = await receipts.claimReceiptRemotely(
        qrPayload,
        async () => new Response("<html>", { status: 502 }),
      );
      expect(broken.body).toStrictEqual({ ok: false, error: "invalid_json_response" });
    });

    it("refuses remote claims without HTTPS or an endpoint", async () => {
      const insecure = receipts.signReceiptForTests(
        sampleReceipt({ claim: { endpoint: "http://issuer.example/claim", claim_key: "c".repeat(32) } }),
      );
      await expect(receipts.claimReceiptRemotely(insecure)).rejects.toThrowError(
        new Error("Remote receipt claim requires HTTPS (HTTP is allowed only for localhost demo)"),
      );
      const noClaim = receipts.signReceiptForTests(sampleReceipt({ claim: undefined }));
      await expect(receipts.claimReceiptRemotely(noClaim)).rejects.toThrowError(
        new Error("Receipt claim.endpoint is required for Wire claim"),
      );
      const tampered: SignedReceiptQrPayload = { ...insecure, digest: "0".repeat(64) };
      await expect(receipts.claimReceiptRemotely(tampered)).rejects.toThrowError(
        new Error("digest_mismatch"),
      );
    });
  });

  describe("inbound Wire claim API", () => {
    it("rejects malformed, unexpected and unauthenticated envelopes", () => {
      expect(receipts.handleReceiptClaimApi("{")).toStrictEqual({
        status: 400,
        body: { ok: false, error: "invalid_envelope" },
      });
      const envelope = {
        protocol_version: "1",
        event_id: randomUUID(),
        occurred_at: new Date().toISOString(),
        origin: { org_id: "org:stranger" },
        identity: { org_ref: { org_id: "org:stranger" } },
        event: { type: "steward.receipt.issued", payload: {} },
        signature: null,
      };
      expect(receipts.handleReceiptClaimApi(JSON.stringify(envelope))).toStrictEqual({
        status: 422,
        body: { ok: false, error: "unexpected_event_type" },
      });
      envelope.event.type = "steward.receipt.claim.requested";
      expect(receipts.handleReceiptClaimApi(JSON.stringify(envelope))).toStrictEqual({
        status: 401,
        body: { ok: false, error: "authenticated_ooo_required" },
      });
    });
  });

  describe("link codec", () => {
    it("re-encodes a decoded v2z link byte for byte", () => {
      const payload = receipts.signReceiptForTests(sampleReceipt());
      const link = receipts.encodeReceiptLink(payload, "https://portal.test/r#old");
      expect(link.startsWith("https://portal.test/r#v2z.")).toBe(true);
      const decoded = receipts.decodeReceiptLink(link);
      expect(decoded).toEqual(payload);
      expect(receipts.encodeReceiptLink(decoded, "https://portal.test/r")).toBe(link);
      expect(receipts.decodeReceiptLink(link.slice(link.indexOf("#") + 1))).toEqual(payload);
    });

    it("still decodes legacy v1 and raw JSON payloads", () => {
      const payload = receipts.signReceiptForTests(sampleReceipt());
      const legacy = `https://portal.test/r#v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
      expect(receipts.decodeReceiptLink(legacy)).toStrictEqual(payload);
      expect(receipts.decodeReceiptLink(JSON.stringify(payload))).toStrictEqual(payload);
      expect(() => receipts.decodeReceiptLink("https://portal.test/r#v9.abc")).toThrowError(
        new Error("Unsupported receipt link version"),
      );
    });

    it("rejects oversized compressed payloads", () => {
      const huge = deflateSync(Buffer.alloc(200_000, 1), { level: 0 }).toString("base64url");
      expect(() => receipts.decodeReceiptLink(`#v2z.${huge}`)).toThrowError(
        new Error("Receipt link payload is too large"),
      );
    });
  });

  it("keeps generated receipt files inside data/receipt-qr", () => {
    initConfig();
    receipts.issueReceipt(issueInput());
    expect(readdirSync(receiptDir()).sort()).toStrictEqual([
      "config.yaml",
      "events",
      "issued",
      "receipts.yaml",
    ]);
  });
});

type SignedEnvelopeLike = {
  event_id: string;
  destination?: unknown;
  signature: unknown;
  event: { type: string; payload: Record<string, unknown> };
};
