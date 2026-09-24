import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { digestBytes } from "../src/lib/document-digest.js";
import { inspectAsiceContainer } from "../src/lib/pdf-esign/asice-lite.js";
import { resolveDigidocRuntime } from "../src/lib/pdf-esign/digidoc-runtime.js";
import {
  createAsiceSkeletonViaSidecar,
  digidocSidecarHealth,
} from "../src/lib/pdf-esign/digidoc-sidecar-client.js";
import {
  buildEsignSecretsSnapshot,
  resetEsignSecretsHydrationForTest,
} from "../src/lib/pdf-esign/esign-secrets-store.js";
import { mockSivaValidate, validateWithSiva } from "../src/lib/pdf-esign/siva-client.js";
import { buildAsiceContainer, writeStoreZip } from "./helpers/asice-zip.js";

const ENDPOINT_ENV_KEYS = [
  "ORGOS_SIVA_BASE_URL",
  "ORGOS_SIVA_MODE",
  "ORGOS_DIGIDOC_SIDECAR_URL",
  "ORGOS_DIGIDOC_SIDECAR_TOKEN",
  "ORGOS_DIGIDOC_SIDECAR_TOKEN_FILE",
  "ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK",
] as const;

const pdf = Buffer.from("%PDF-1.7\nendpoint characterization\n", "utf-8");

type FetchCall = { url: string; init?: RequestInit };

function fakeFetch(
  respond: (call: FetchCall) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function failingFetch(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sivaReport(indications: string[], validCount = indications.length) {
  return {
    validationReport: {
      validationConclusion: {
        validationTime: "2026-09-24T00:00:00Z",
        signaturesCount: indications.length,
        validSignaturesCount: validCount,
        signatures: indications.map((indication) => ({ indication })),
        validatedDocument: { filename: "signed.asice" },
      },
    },
  };
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

const LIVE_FAILURE_BASE = {
  mode: "live",
  ok: false,
  indication: "TOTAL-FAILED",
  signatures_count: 0,
  valid_signatures_count: 0,
} as const;

describe("pdf esign endpoints — characterization", () => {
  let dir = "";
  let asicePath = "";
  let pdfPath = "";
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    setTenantId("_fixture-books");
    for (const key of ENDPOINT_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    resetEsignSecretsHydrationForTest();
    dir = mkdtempSync(join(tmpdir(), "orgos-esign-endpoints-"));
    asicePath = join(dir, "signed.asice");
    writeFileSync(asicePath, buildAsiceContainer(pdf));
    pdfPath = join(dir, "contract.pdf");
    writeFileSync(pdfPath, pdf);
  });

  afterEach(() => {
    for (const key of ENDPOINT_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    resetEsignSecretsHydrationForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("resolveDigidocRuntime", () => {
    it("prefers env, strips one trailing slash and parses the loopback flag", () => {
      process.env.ORGOS_SIVA_BASE_URL = " https://siva.test/ ";
      process.env.ORGOS_DIGIDOC_SIDECAR_URL = "http://127.0.0.1:8090/";
      process.env.ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK = "YES";
      process.env.ORGOS_DIGIDOC_SIDECAR_TOKEN = " secret-token ";
      expect(resolveDigidocRuntime()).toStrictEqual({
        siva_base_url: "https://siva.test",
        digidoc_sidecar_url: "http://127.0.0.1:8090",
        siva_mode: "live",
        allow_http_loopback: true,
        siva_timeout_ms: 30_000,
        sidecar_timeout_ms: 60_000,
        max_pdf_bytes: 25 * 1024 * 1024,
        max_asice_bytes: 40 * 1024 * 1024,
        sidecar_token: "secret-token",
      });
    });

    it("falls back to defaults when nothing is configured", () => {
      process.env.ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK = "no";
      const runtime = resolveDigidocRuntime({ sivaMode: "mock" });
      expect(runtime.siva_base_url).toBeUndefined();
      expect(runtime.digidoc_sidecar_url).toBeUndefined();
      expect(runtime.siva_mode).toBe("mock");
      expect(runtime.allow_http_loopback).toBe(false);
      expect(runtime.sidecar_token).toBeUndefined();
    });

    it("reports loopback in the masked snapshot only for truthy flags", () => {
      process.env.ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK = "True";
      expect(buildEsignSecretsSnapshot().allow_http_loopback).toBe(true);
      process.env.ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK = "maybe";
      expect(buildEsignSecretsSnapshot().allow_http_loopback).toBe(false);
    });
  });

  describe("inspectAsiceContainer", () => {
    it("returns the full fact set for a well-formed container", () => {
      const bytes = readFileSync(asicePath);
      expect(inspectAsiceContainer(asicePath)).toStrictEqual({
        ok: true,
        container_digest: createHash("sha256").update(bytes).digest("hex"),
        byte_length: bytes.length,
        entry_names: ["mimetype", "contract.pdf", "META-INF/signatures0.xml"],
        pdf_member_digests: [digestBytes(pdf).content_digest],
        has_signature_meta: true,
        had_deflated_pdf: false,
      });
    });

    it("rejects an oversized container before reading it", () => {
      const size = readFileSync(asicePath).length;
      expect(inspectAsiceContainer(asicePath, { maxAsiceBytes: 10 })).toStrictEqual({
        ok: false,
        reason: "asice_too_large",
        container_digest: "",
        byte_length: size,
        entry_names: [],
        pdf_member_digests: [],
      });
    });

    it("rejects a file that is not a zip", () => {
      const path = join(dir, "plain.asice");
      writeFileSync(path, "hello world");
      expect(inspectAsiceContainer(path)).toStrictEqual({
        ok: false,
        reason: "not_zip_local_header",
        container_digest: createHash("sha256").update("hello world").digest("hex"),
        byte_length: 11,
        entry_names: [],
        pdf_member_digests: [],
      });
    });

    it("rejects a traversal member name", () => {
      const path = join(dir, "evil.asice");
      writeStoreZip(path, [{ name: "../evil.pdf", data: pdf }]);
      const lite = inspectAsiceContainer(path);
      expect(lite.ok).toBe(false);
      expect(lite.reason).toBe("unsafe_zip_entry_name");
      expect(lite.entry_names).toStrictEqual([]);
    });

    it("rejects a wrong mimetype and keeps the entry names", () => {
      const path = join(dir, "mime.asice");
      writeStoreZip(path, [
        { name: "mimetype", data: Buffer.from("application/zip", "utf-8") },
        { name: "META-INF/manifest.xml", data: Buffer.from("<m/>", "utf-8") },
      ]);
      const lite = inspectAsiceContainer(path);
      expect(lite.reason).toBe("invalid_asice_mimetype");
      expect(lite.entry_names).toStrictEqual(["mimetype", "META-INF/manifest.xml"]);
      expect(lite.pdf_member_digests).toStrictEqual([]);
    });

    it("rejects a container without a mimetype member", () => {
      const path = join(dir, "nomime.asice");
      writeStoreZip(path, [
        { name: "META-INF/manifest.xml", data: Buffer.from("<m/>", "utf-8") },
      ]);
      expect(inspectAsiceContainer(path).reason).toBe("missing_or_compressed_mimetype");
      expect(inspectAsiceContainer(path, { requireMimetype: false }).ok).toBe(true);
    });
  });

  describe("mockSivaValidate", () => {
    it("fails closed when the lite check failed", () => {
      const summary = {
        indication: "TOTAL-FAILED",
        signatures_count: 0,
        valid_signatures_count: 0,
        signature_indications: [],
        filename: "x.asice",
        mock: true,
      };
      expect(
        mockSivaValidate({ liteOk: false, pdfDigestOk: true, filename: "x.asice" }),
      ).toStrictEqual({
        mode: "mock",
        ok: false,
        indication: "TOTAL-FAILED",
        signatures_count: 0,
        valid_signatures_count: 0,
        reason: "lite_asice_failed",
        response_digest: sha256Json(summary),
        summary,
      });
    });

    it("fails on a PDF digest mismatch", () => {
      const result = mockSivaValidate({ liteOk: true, pdfDigestOk: false });
      expect(result).toStrictEqual({
        mode: "mock",
        ok: false,
        indication: "TOTAL-FAILED",
        signatures_count: 1,
        valid_signatures_count: 0,
        reason: "pdf_digest_mismatch",
        response_digest: result.response_digest,
        summary: {
          indication: "TOTAL-FAILED",
          signatures_count: 1,
          valid_signatures_count: 0,
          signature_indications: ["TOTAL-FAILED"],
          filename: undefined,
          mock: true,
        },
      });
    });

    it("passes with a default filename and validation time", () => {
      const result = mockSivaValidate({ liteOk: true, pdfDigestOk: null });
      expect(Object.keys(result)).toStrictEqual([
        "mode",
        "ok",
        "indication",
        "signatures_count",
        "valid_signatures_count",
        "validation_time",
        "response_digest",
        "summary",
      ]);
      expect(result.ok).toBe(true);
      expect(result.summary?.filename).toBe("document.asice");
      expect(result.validation_time).toBe(result.summary?.validation_time);
      expect(result.response_digest).toBe(sha256Json(result.summary));
    });
  });

  describe("validateWithSiva (live)", () => {
    const liveInput = () => ({
      asicePath,
      liteOk: true,
      pdfDigestOk: true as boolean | null,
      mode: "live" as const,
    });

    it("requires a SiVa base URL", async () => {
      expect(await validateWithSiva(liveInput())).toStrictEqual({
        ...LIVE_FAILURE_BASE,
        reason: "siva_base_url_missing",
      });
    });

    it("requires HTTPS for non-loopback hosts", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "http://siva.example";
      expect(await validateWithSiva(liveInput())).toStrictEqual({
        ...LIVE_FAILURE_BASE,
        reason: "siva_https_required",
      });
    });

    it("denies plaintext loopback unless allowed", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "http://127.0.0.1:8080";
      expect((await validateWithSiva(liveInput())).reason).toBe(
        "siva_http_loopback_denied",
      );
      const { fetchImpl } = fakeFetch(() => jsonResponse(sivaReport(["TOTAL-PASSED"])));
      const allowed = await validateWithSiva({
        ...liveInput(),
        allowHttpLoopback: true,
        fetchImpl,
      });
      expect(allowed.ok).toBe(true);
    });

    it("short-circuits failed pre-checks without calling SiVa", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "https://siva.test";
      const { fetchImpl, calls } = fakeFetch(() => jsonResponse({}));
      expect(
        await validateWithSiva({ ...liveInput(), liteOk: false, fetchImpl }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "lite_asice_failed" });
      expect(
        await validateWithSiva({ ...liveInput(), pdfDigestOk: false, fetchImpl }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "pdf_digest_mismatch" });
      expect(
        await validateWithSiva({ ...liveInput(), maxAsiceBytes: 10, fetchImpl }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "asice_too_large" });
      expect(calls).toHaveLength(0);
    });

    it("maps transport failures to timeout / unreachable", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "https://siva.test";
      expect(
        await validateWithSiva({
          ...liveInput(),
          fetchImpl: failingFetch("This operation was aborted"),
        }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "siva_timeout" });
      expect(
        await validateWithSiva({ ...liveInput(), fetchImpl: failingFetch("ECONNREFUSED") }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "siva_unreachable: ECONNREFUSED" });
    });

    it("maps non-JSON, HTTP errors and schema drift", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "https://siva.test";
      const nonJson = fakeFetch(() => new Response("<html>", { status: 502 }));
      expect(
        await validateWithSiva({ ...liveInput(), fetchImpl: nonJson.fetchImpl }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "siva_non_json_502" });

      const httpError = fakeFetch(() => jsonResponse({ error: "boom" }, 500));
      expect(
        await validateWithSiva({ ...liveInput(), fetchImpl: httpError.fetchImpl }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "siva_http_500" });

      const drift = fakeFetch(() => jsonResponse({ validationReport: {} }));
      expect(
        await validateWithSiva({ ...liveInput(), fetchImpl: drift.fetchImpl }),
      ).toStrictEqual({ ...LIVE_FAILURE_BASE, reason: "siva_schema_invalid" });
    });

    it("records a national TOTAL-PASSED with a canonical summary digest", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "https://siva.test/";
      const { fetchImpl, calls } = fakeFetch(() =>
        jsonResponse(sivaReport(["TOTAL-PASSED", "TOTAL-PASSED"])),
      );
      const result = await validateWithSiva({ ...liveInput(), fetchImpl });
      const summary = {
        indication: "TOTAL-PASSED",
        signatures_count: 2,
        valid_signatures_count: 2,
        validation_time: "2026-09-24T00:00:00Z",
        signature_indications: ["TOTAL-PASSED", "TOTAL-PASSED"],
        filename: "signed.asice",
        mock: undefined,
      };
      expect(result).toStrictEqual({
        mode: "live",
        ok: true,
        indication: "TOTAL-PASSED",
        signatures_count: 2,
        valid_signatures_count: 2,
        validation_time: "2026-09-24T00:00:00Z",
        response_digest: sha256Json(summary),
        summary,
        reason: undefined,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("https://siva.test/validate");
      const body = JSON.parse(String(calls[0]!.init?.body)) as Record<string, string>;
      expect(body.filename).toBe("signed.asice");
      expect(body.reportType).toBe("Simple");
      expect(Buffer.from(body.document!, "base64")).toStrictEqual(readFileSync(asicePath));
    });

    it("reports the first failing indication when not all signatures pass", async () => {
      process.env.ORGOS_SIVA_BASE_URL = "https://siva.test";
      const { fetchImpl } = fakeFetch(() =>
        jsonResponse(sivaReport(["TOTAL-PASSED", "INDETERMINATE"], 1)),
      );
      const result = await validateWithSiva({ ...liveInput(), fetchImpl });
      expect(result.ok).toBe(false);
      expect(result.indication).toBe("INDETERMINATE");
      expect(result.reason).toBe("siva_not_total_passed");
      expect(result.summary?.signature_indications).toStrictEqual([
        "INDETERMINATE",
        "TOTAL-PASSED",
      ]);
    });
  });

  describe("createAsiceSkeletonViaSidecar", () => {
    const outPath = () => join(dir, "out", "unsigned.asice");

    it("requires a sidecar URL", async () => {
      expect(
        await createAsiceSkeletonViaSidecar({ pdfPath, outPath: outPath() }),
      ).toStrictEqual({ ok: false, reason: "digidoc_sidecar_url_missing" });
    });

    it("requires HTTPS for non-loopback hosts", async () => {
      expect(
        await createAsiceSkeletonViaSidecar({
          pdfPath,
          outPath: outPath(),
          baseUrl: "http://sidecar.example",
        }),
      ).toStrictEqual({ ok: false, reason: "sidecar_https_required" });
    });

    it("rejects unsafe filenames, oversize and non-PDF input", async () => {
      process.env.ORGOS_DIGIDOC_SIDECAR_URL = "https://sidecar.test";
      const base = { pdfPath, outPath: outPath() };
      expect(
        await createAsiceSkeletonViaSidecar({ ...base, filename: "../x.pdf" }),
      ).toStrictEqual({
        ok: false,
        reason: "unsafe_pdf_filename",
        sidecar_url: "https://sidecar.test",
      });
      expect(
        await createAsiceSkeletonViaSidecar({ ...base, maxPdfBytes: 5 }),
      ).toStrictEqual({ ok: false, reason: "pdf_too_large", sidecar_url: "https://sidecar.test" });
      const notPdf = join(dir, "note.pdf");
      writeFileSync(notPdf, "plain text");
      expect(
        await createAsiceSkeletonViaSidecar({ ...base, pdfPath: notPdf }),
      ).toStrictEqual({ ok: false, reason: "not_pdf_magic", sidecar_url: "https://sidecar.test" });
    });

    it("maps transport, auth and HTTP failures", async () => {
      process.env.ORGOS_DIGIDOC_SIDECAR_URL = "https://sidecar.test";
      const base = { pdfPath, outPath: outPath() };
      const sidecar_url = "https://sidecar.test";
      expect(
        await createAsiceSkeletonViaSidecar({
          ...base,
          fetchImpl: failingFetch("The user aborted a request"),
        }),
      ).toStrictEqual({ ok: false, sidecar_url, reason: "sidecar_timeout" });
      expect(
        await createAsiceSkeletonViaSidecar({ ...base, fetchImpl: failingFetch("EHOSTDOWN") }),
      ).toStrictEqual({ ok: false, sidecar_url, reason: "sidecar_unreachable: EHOSTDOWN" });
      expect(
        await createAsiceSkeletonViaSidecar({
          ...base,
          fetchImpl: fakeFetch(() => new Response("nope", { status: 401 })).fetchImpl,
        }),
      ).toStrictEqual({ ok: false, sidecar_url, reason: "sidecar_non_json_401" });
      expect(
        await createAsiceSkeletonViaSidecar({
          ...base,
          fetchImpl: fakeFetch(() => jsonResponse({}, 403)).fetchImpl,
        }),
      ).toStrictEqual({ ok: false, sidecar_url, reason: "sidecar_auth_rejected" });
      expect(
        await createAsiceSkeletonViaSidecar({
          ...base,
          fetchImpl: fakeFetch(() => jsonResponse({ error: "digidoc4j_failed" }, 500)).fetchImpl,
        }),
      ).toStrictEqual({ ok: false, sidecar_url, reason: "digidoc4j_failed" });
      expect(
        await createAsiceSkeletonViaSidecar({
          ...base,
          fetchImpl: fakeFetch(() => jsonResponse({}, 200)).fetchImpl,
        }),
      ).toStrictEqual({ ok: false, sidecar_url, reason: "sidecar_http_200" });
    });

    it("removes a returned container that fails the lite check", async () => {
      process.env.ORGOS_DIGIDOC_SIDECAR_URL = "https://sidecar.test";
      const { fetchImpl } = fakeFetch(() =>
        jsonResponse({ document: Buffer.from("not a zip").toString("base64") }),
      );
      expect(
        await createAsiceSkeletonViaSidecar({ pdfPath, outPath: outPath(), fetchImpl }),
      ).toStrictEqual({
        ok: false,
        sidecar_url: "https://sidecar.test",
        reason: "sidecar_asice_invalid:not_zip_local_header",
      });
      expect(existsSync(outPath())).toBe(false);
    });

    it("writes the skeleton and sends the bearer token", async () => {
      process.env.ORGOS_DIGIDOC_SIDECAR_URL = "https://sidecar.test";
      process.env.ORGOS_DIGIDOC_SIDECAR_TOKEN = "sidecar-token";
      const skeleton = buildAsiceContainer(pdf, "contract.pdf");
      const { fetchImpl, calls } = fakeFetch(() =>
        jsonResponse({ document: skeleton.toString("base64") }),
      );
      const result = await createAsiceSkeletonViaSidecar({
        pdfPath,
        outPath: outPath(),
        fetchImpl,
      });
      expect(result).toStrictEqual({
        ok: true,
        out_path: outPath(),
        byte_length: skeleton.length,
        digest: createHash("sha256").update(skeleton).digest("hex"),
        sidecar_url: "https://sidecar.test",
      });
      expect(readFileSync(outPath())).toStrictEqual(skeleton);
      expect(calls[0]!.url).toBe("https://sidecar.test/container/create");
      const headers = calls[0]!.init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer sidecar-token");
      const body = JSON.parse(String(calls[0]!.init?.body)) as Record<string, string>;
      expect(body.filename).toBe("contract.pdf");
      expect(body.mimeType).toBe("application/pdf");
    });
  });

  describe("digidocSidecarHealth", () => {
    it("reports health and readiness separately", async () => {
      const { fetchImpl, calls } = fakeFetch((call) =>
        call.url.endsWith("/health")
          ? new Response("ok", { status: 200 })
          : new Response("warming", { status: 503 }),
      );
      expect(
        await digidocSidecarHealth("https://sidecar.test/", fetchImpl, { token: "t" }),
      ).toStrictEqual({ ok: true, ready: false, reason: "ready_503" });
      expect(calls.map((c) => c.url)).toStrictEqual([
        "https://sidecar.test/health",
        "https://sidecar.test/ready",
      ]);
    });

    it("fails without a URL or on an unhealthy sidecar", async () => {
      expect(await digidocSidecarHealth(undefined, fetch)).toStrictEqual({
        ok: false,
        reason: "digidoc_sidecar_url_missing",
      });
      const { fetchImpl } = fakeFetch(() => new Response("down", { status: 500 }));
      expect(await digidocSidecarHealth("https://sidecar.test", fetchImpl)).toStrictEqual({
        ok: false,
        reason: "health_500",
      });
    });
  });
});
