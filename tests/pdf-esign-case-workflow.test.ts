import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { setTenantId } from "../src/lib/tenant.js";
import { getPdfEsignCasesPath, getPdfEsignDataDir } from "../src/lib/pdf-esign/paths.js";
import { findPdfEsignCase } from "../src/lib/pdf-esign/case-store.js";
import { resetEsignSecretsHydrationForTest } from "../src/lib/pdf-esign/esign-secrets-store.js";
import type { PdfEsignCase } from "../schemas/pdf-esign.js";
import { buildAsiceContainer } from "./helpers/asice-zip.js";

const audit = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>> }));
vi.mock("../src/lib/steward-chat/audit.js", () => ({
  appendChatAudit: (entry: Record<string, unknown>) => audit.entries.push(entry),
}));

const { handleEsignApi } = await import("../src/lib/steward-chat/routes/esign-api.js");
const cli = await import("../src/commands/operations-esign.js");

const ENV_KEYS = [
  "ORGOS_SIVA_BASE_URL",
  "ORGOS_SIVA_MODE",
  "ORGOS_DIGIDOC_SIDECAR_URL",
  "ORGOS_DIGIDOC_SIDECAR_TOKEN",
  "ORGOS_DIGIDOC_SIDECAR_TOKEN_FILE",
  "ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK",
  "ORGOS_ENV",
  "ORGOS_PROD",
] as const;

const USER = { operator_id: "OP-TEST", approver_id: "OP-TEST", mode: "dev" as const };
const pdf = Buffer.from("%PDF-1.7\nworkflow characterization\n", "utf-8");
const pdfDigest = createHash("sha256").update(pdf).digest("hex");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function callApi(
  pathname: string,
  body?: unknown,
): Promise<{ handled: boolean; status: number; json: Record<string, unknown> }> {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf-8")];
  const req = Object.assign(Readable.from(payload), { headers: {} }) as unknown as IncomingMessage;
  let status = 0;
  let raw = "";
  const res = {
    writeHead(code: number) {
      status = code;
      return res;
    },
    end(chunk?: string) {
      raw = chunk ?? "";
      return res;
    },
  } as unknown as ServerResponse;
  const handled = await handleEsignApi(
    req,
    res,
    pathname,
    body === undefined ? "GET" : "POST",
    USER,
  );
  return { handled, status, json: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
}

function stubFetch(respond: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return respond(String(url), init);
  });
  return calls;
}

function sivaPassed(): Response {
  return new Response(
    JSON.stringify({
      validationReport: {
        validationConclusion: {
          validationTime: "2026-09-24T00:00:00Z",
          signaturesCount: 1,
          validSignaturesCount: 1,
          signatures: [{ indication: "TOTAL-PASSED" }],
        },
      },
    }),
    { status: 200 },
  );
}

function captureConsole(): { lines: string[]; json: () => Record<string, unknown> } {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  return {
    lines,
    json: () => JSON.parse(lines.join("\n")) as Record<string, unknown>,
  };
}

describe("pdf esign case workflow — characterization", () => {
  let workBackup = "";
  let scratch = "";
  const savedEnv: Record<string, string | undefined> = {};
  const workRoot = () => join(getPdfEsignDataDir(), "work");
  const runtimeYaml = () => join(getPdfEsignDataDir(), "digidoc.yaml");

  beforeAll(() => {
    setTenantId("_fixture-books");
    workBackup = mkdtempSync(join(tmpdir(), "orgos-esign-work-backup-"));
    if (existsSync(workRoot())) cpSync(workRoot(), workBackup, { recursive: true });
  });

  afterAll(() => {
    rmSync(workRoot(), { recursive: true, force: true });
    cpSync(workBackup, workRoot(), { recursive: true });
    rmSync(workBackup, { recursive: true, force: true });
  });

  beforeEach(() => {
    setTenantId("_fixture-books");
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.ORGOS_SIVA_MODE = "mock";
    resetEsignSecretsHydrationForTest();
    rmSync(getPdfEsignCasesPath(), { force: true });
    rmSync(workRoot(), { recursive: true, force: true });
    audit.entries.length = 0;
    scratch = mkdtempSync(join(tmpdir(), "orgos-esign-workflow-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    resetEsignSecretsHydrationForTest();
    rmSync(getPdfEsignCasesPath(), { force: true });
    rmSync(runtimeYaml(), { force: true });
    rmSync(scratch, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  describe("HTTP BFF", () => {
    async function createViaApi(filename?: string): Promise<Record<string, unknown>> {
      const res = await callApi("/chat/v1/esign/create", {
        title: "NDA",
        pdf_base64: pdf.toString("base64"),
        ...(filename ? { filename } : {}),
        contract_id: "CT-1",
      });
      expect(res.status).toBe(200);
      return res.json.case as Record<string, unknown>;
    }

    it("stores the uploaded PDF in the case work dir with a sanitized name", async () => {
      const row = await createViaApi("my contract (v2).pdf");
      const id = String(row.id);
      const record = findPdfEsignCase(id)!;
      expect(record.pdf_path).toBe(join(workRoot(), id, "my_contract__v2_.pdf"));
      expect(readFileSync(record.pdf_path)).toStrictEqual(pdf);
      expect(statSync(record.pdf_path).mode & 0o777).toBe(0o600);
      expect(record).toMatchObject({
        title: "NDA",
        status: "draft",
        provider_id: "digidoc",
        national_eid_stack: "EE/digidoc",
        content_digest: pdfDigest,
        byte_length: pdf.length,
        work_dir: join(workRoot(), id),
        contract_id: "CT-1",
      });
      expect(row).not.toHaveProperty("pdf_path");
      expect(row).not.toHaveProperty("work_dir");
      expect([
        "id",
        "title",
        "status",
        "provider_id",
        "content_digest",
        "container_digest",
        "unsigned_asice_digest",
        "siva_mode",
        "siva_indication",
        "siva_validated_at",
        "siva_signatures_count",
        "siva_valid_signatures_count",
        "siva_reason",
        "contract_id",
        "approval_id",
        "updated_at",
      ]).toEqual(expect.arrayContaining(Object.keys(row)));
      expect(audit.entries).toStrictEqual([
        {
          action: "esign_create",
          operator_id: "OP-TEST",
          approver_id: "OP-TEST",
          ok: true,
          path: "/chat/v1/esign/create",
          detail: id,
        },
      ]);
    });

    it("defaults the stored file name to source.pdf", async () => {
      const row = await createViaApi();
      expect(findPdfEsignCase(String(row.id))!.pdf_path).toBe(
        join(workRoot(), String(row.id), "source.pdf"),
      );
    });

    it("rejects an oversized upload and audits the failure", async () => {
      writeFileSync(runtimeYaml(), "version: 1\nmax_pdf_bytes: 10\n");
      const res = await callApi("/chat/v1/esign/create", {
        title: "NDA",
        pdf_base64: pdf.toString("base64"),
      });
      expect(res.status).toBe(422);
      expect(res.json).toStrictEqual({
        ok: false,
        error: `pdf_too_large: ${pdf.length} > 10`,
      });
      expect(audit.entries).toMatchObject([
        { action: "esign_create", ok: false, detail: `pdf_too_large: ${pdf.length} > 10` },
      ]);
    });

    it("reports a missing sidecar as 502 on prepare", async () => {
      const id = String((await createViaApi("contract.pdf")).id);
      const res = await callApi("/chat/v1/esign/prepare", { case_id: id });
      expect(res.status).toBe(502);
      expect(res.json).toStrictEqual({ ok: false, error: "digidoc_sidecar_url_missing" });
      expect(audit.entries.at(-1)).toMatchObject({
        action: "esign_prepare",
        ok: false,
        detail: `${id}: digidoc_sidecar_url_missing`,
      });
    });

    it("prepares a skeleton named document.pdf", async () => {
      process.env.ORGOS_DIGIDOC_SIDECAR_URL = "https://sidecar.test";
      const skeleton = buildAsiceContainer(pdf, "document.pdf");
      const calls = stubFetch(
        () => new Response(JSON.stringify({ document: skeleton.toString("base64") })),
      );
      const id = String((await createViaApi("contract.pdf")).id);
      const res = await callApi("/chat/v1/esign/prepare", { case_id: id });
      expect(res.status).toBe(200);
      expect(calls[0]!.body.filename).toBe("document.pdf");
      const record = findPdfEsignCase(id)!;
      expect(record.unsigned_asice_path).toBe(join(workRoot(), id, "unsigned.asice"));
      expect(record.unsigned_asice_digest).toBe(
        createHash("sha256").update(skeleton).digest("hex"),
      );
      expect(audit.entries.at(-1)).toMatchObject({ action: "esign_prepare", ok: true, detail: id });
    });

    it("rejects an attachment that fails the lite check but keeps the file", async () => {
      const id = String((await createViaApi("contract.pdf")).id);
      const res = await callApi("/chat/v1/esign/attach", {
        case_id: id,
        asice_base64: Buffer.from("not a zip").toString("base64"),
      });
      expect(res.status).toBe(422);
      expect(res.json).toStrictEqual({ ok: false, error: "not_zip_local_header" });
      expect(existsSync(join(workRoot(), id, "signed.asice"))).toBe(true);
      expect(findPdfEsignCase(id)!.status).toBe("draft");
      expect(audit.entries.at(-1)).toMatchObject({
        action: "esign_attach",
        ok: false,
        detail: `${id}: not_zip_local_header`,
      });
    });

    it("attaches a valid container and reports the PDF digest match", async () => {
      const id = String((await createViaApi("contract.pdf")).id);
      const container = buildAsiceContainer(pdf);
      const res = await callApi("/chat/v1/esign/attach", {
        case_id: id,
        asice_base64: container.toString("base64"),
      });
      expect(res.status).toBe(200);
      expect(res.json.pdf_digest_matches).toBe(true);
      const containerPath = join(workRoot(), id, "signed.asice");
      expect(statSync(containerPath).mode & 0o777).toBe(0o600);
      expect(findPdfEsignCase(id)).toMatchObject({
        container_path: containerPath,
        container_digest: createHash("sha256").update(container).digest("hex"),
        status: "partially_signed",
      });
      expect(audit.entries.at(-1)).toMatchObject({ action: "esign_attach", ok: true, detail: id });
    });

    it("refuses to verify before a container is attached", async () => {
      const id = String((await createViaApi("contract.pdf")).id);
      const res = await callApi("/chat/v1/esign/verify", { case_id: id });
      expect(res.status).toBe(422);
      expect(res.json).toStrictEqual({
        ok: false,
        error: `container missing for ${id} — attach first`,
      });
    });

    it("mock verification never completes a case", async () => {
      const id = String((await createViaApi("contract.pdf")).id);
      await callApi("/chat/v1/esign/attach", {
        case_id: id,
        asice_base64: buildAsiceContainer(pdf).toString("base64"),
      });
      const res = await callApi("/chat/v1/esign/verify", { case_id: id });
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ ok: true, nationally_verified: false });
      expect(findPdfEsignCase(id)).toMatchObject({
        status: "partially_signed",
        siva_mode: "mock",
        siva_indication: "TOTAL-PASSED",
        siva_signatures_count: 1,
        siva_valid_signatures_count: 1,
      });
      expect(audit.entries.at(-1)).toMatchObject({
        action: "esign_verify",
        ok: true,
        detail: `${id}: TOTAL-PASSED (mock)`,
      });
    });

    it("marks a tampered container as failed", async () => {
      const id = String((await createViaApi("contract.pdf")).id);
      const other = Buffer.from("%PDF-1.7\nsomething else\n", "utf-8");
      await callApi("/chat/v1/esign/attach", {
        case_id: id,
        asice_base64: buildAsiceContainer(other).toString("base64"),
      });
      const res = await callApi("/chat/v1/esign/verify", { case_id: id });
      expect(res.json).toMatchObject({ ok: false, nationally_verified: false });
      expect(findPdfEsignCase(id)).toMatchObject({
        status: "failed",
        siva_reason: "pdf_digest_mismatch",
      });
    });

    it("completes a case only on live TOTAL-PASSED", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "https://siva.test";
      stubFetch(() => sivaPassed());
      const id = String((await createViaApi("contract.pdf")).id);
      await callApi("/chat/v1/esign/attach", {
        case_id: id,
        asice_base64: buildAsiceContainer(pdf).toString("base64"),
      });
      const res = await callApi("/chat/v1/esign/verify", { case_id: id, siva_mode: "live" });
      expect(res.json).toMatchObject({ ok: true, nationally_verified: true });
      expect(findPdfEsignCase(id)).toMatchObject({ status: "completed", siva_mode: "live" });
    });

    it("reports unknown cases and leaves other paths unhandled", async () => {
      const res = await callApi("/chat/v1/esign/verify", { case_id: "ES-1999-001" });
      expect(res.json).toStrictEqual({ ok: false, error: "esign case not found: ES-1999-001" });
      expect((await callApi("/chat/v1/other")).handled).toBe(false);
    });
  });

  describe("CLI", () => {
    function writeSourcePdf(): string {
      const path = join(scratch, "contract.pdf");
      writeFileSync(path, pdf);
      return path;
    }

    function createViaCli(): PdfEsignCase {
      captureConsole();
      const record = cli.runEsignCreate({ pdf: writeSourcePdf(), title: "NDA", json: true });
      vi.restoreAllMocks();
      return record;
    }

    it("creates a case that points at the original PDF", () => {
      const source = writeSourcePdf();
      const out = captureConsole();
      const record = cli.runEsignCreate({ pdf: source, title: "NDA", approvalId: "AP-1", json: true });
      expect(record).toMatchObject({
        status: "draft",
        provider_id: "digidoc",
        national_eid_stack: "EE/digidoc",
        pdf_path: source,
        content_digest: pdfDigest,
        byte_length: pdf.length,
        work_dir: join(workRoot(), record.id),
        approval_id: "AP-1",
      });
      expect(existsSync(join(workRoot(), record.id))).toBe(true);
      expect(out.json()).toStrictEqual(JSON.parse(JSON.stringify({ ok: true, case: record })));
    });

    it("refuses a missing PDF", () => {
      expect(() =>
        cli.runEsignCreate({ pdf: join(scratch, "missing.pdf"), title: "NDA" }),
      ).toThrow(`pdf not found: ${join(scratch, "missing.pdf")}`);
    });

    it("flags a failed prepare through the exit code", async () => {
      const record = createViaCli();
      const out = captureConsole();
      await cli.runEsignPrepare({ id: record.id, json: true });
      expect(out.json()).toStrictEqual({ ok: false, reason: "digidoc_sidecar_url_missing" });
      expect(process.exitCode).toBe(1);
    });

    it("prepares a skeleton named after the source PDF", async () => {
      process.env.ORGOS_DIGIDOC_SIDECAR_URL = "https://sidecar.test";
      const skeleton = buildAsiceContainer(pdf);
      const calls = stubFetch(
        () => new Response(JSON.stringify({ document: skeleton.toString("base64") })),
      );
      const record = createViaCli();
      captureConsole();
      await cli.runEsignPrepare({ id: record.id, json: true });
      expect(calls[0]!.body.filename).toBe("contract.pdf");
      expect(findPdfEsignCase(record.id)!.unsigned_asice_path).toBe(
        join(workRoot(), record.id, "unsigned.asice"),
      );
    });

    it("hands the case to the signer", async () => {
      const record = createViaCli();
      const out = captureConsole();
      await cli.runEsignSend({ id: record.id, json: true });
      expect(findPdfEsignCase(record.id)).toMatchObject({
        status: "sent",
        external_ref: `digidoc-${record.id}`,
      });
      expect(out.json()).toMatchObject({ ok: true });
      expect(existsSync(join(workRoot(), record.id, "contract.pdf"))).toBe(true);
    });

    it("rejects an attachment that fails the lite check", () => {
      const record = createViaCli();
      const container = join(scratch, "whatever.asice");
      writeFileSync(container, "not a zip");
      const out = captureConsole();
      expect(() =>
        cli.runEsignAttachContainer({ id: record.id, asice: container, json: true }),
      ).toThrow("not_zip_local_header");
      expect(out.json()).toStrictEqual({ ok: false, reason: "not_zip_local_header" });
      expect(process.exitCode).toBe(1);
      expect(findPdfEsignCase(record.id)!.status).toBe("draft");
      expect(() =>
        cli.runEsignAttachContainer({ id: record.id, asice: join(scratch, "nope.asice") }),
      ).toThrow(`asice not found: ${join(scratch, "nope.asice")}`);
    });

    it("attaches a valid container after the lite check", () => {
      const record = createViaCli();
      const container = join(scratch, "signed.asice");
      writeFileSync(container, buildAsiceContainer(pdf));
      captureConsole();
      const next = cli.runEsignAttachContainer({ id: record.id, asice: container, json: true });
      expect(next).toMatchObject({
        container_path: container,
        container_digest: sha256File(container),
        status: "partially_signed",
      });
    });

    it("requires an existing container file before verifying", async () => {
      const record = createViaCli();
      await expect(cli.runEsignVerifyDigidoc({ id: record.id })).rejects.toThrow(
        `container missing for ${record.id} — attach-container first`,
      );
      const container = join(scratch, "signed.asice");
      writeFileSync(container, buildAsiceContainer(pdf));
      captureConsole();
      cli.runEsignAttachContainer({ id: record.id, asice: container });
      unlinkSync(container);
      await expect(cli.runEsignVerifyDigidoc({ id: record.id })).rejects.toThrow(
        `container missing for ${record.id} — attach-container first`,
      );
    });

    it("records mock verification without completing the case", async () => {
      const record = createViaCli();
      const container = join(scratch, "signed.asice");
      writeFileSync(container, buildAsiceContainer(pdf));
      const out = captureConsole();
      cli.runEsignAttachContainer({ id: record.id, asice: container });
      out.lines.length = 0;
      await cli.runEsignVerifyDigidoc({ id: record.id, json: true });
      expect(out.json()).toMatchObject({ ok: true, nationally_verified: false });
      expect(findPdfEsignCase(record.id)).toMatchObject({
        status: "partially_signed",
        siva_mode: "mock",
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("accept-live attaches and completes on live TOTAL-PASSED", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "https://siva.test";
      stubFetch(() => sivaPassed());
      const record = createViaCli();
      const container = join(scratch, "signed.asice");
      writeFileSync(container, buildAsiceContainer(pdf));
      const out = captureConsole();
      await cli.runEsignAcceptLive({ id: record.id, asice: container, json: true });
      expect(out.lines[0]).toBe(`✓ container 添付 ${record.id}`);
      expect(JSON.parse(out.lines.slice(1).join("\n"))).toMatchObject({
        ok: true,
        nationally_verified: true,
      });
      expect(findPdfEsignCase(record.id)).toMatchObject({
        status: "completed",
        container_path: container,
      });
    });

    it("rejects unknown cases", async () => {
      await expect(cli.runEsignSend({ id: "ES-1999-001" })).rejects.toThrow(
        "esign case not found: ES-1999-001",
      );
    });
  });
});
