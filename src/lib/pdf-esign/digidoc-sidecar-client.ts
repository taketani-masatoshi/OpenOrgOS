import { basename, dirname, join } from "node:path";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import {
  assertTrustedEndpoint,
  resolveAllowHttpLoopback,
  resolveDigidocRuntime,
  resolveDigidocSidecarToken,
  resolveDigidocSidecarUrl,
} from "./digidoc-runtime.js";
import { inspectAsiceContainer } from "./asice-lite.js";

/**
 * digidoc4j sidecar — creates unsigned ASiC-E skeletons only.
 * Signing stays on DigiDoc4 + national card (no PIN / server keys).
 */

export type CreateAsiceSkeletonInput = {
  pdfPath: string;
  filename?: string;
  /** Destination .asice path */
  outPath: string;
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowHttpLoopback?: boolean;
  maxPdfBytes?: number;
};

export type CreateAsiceSkeletonResult = {
  ok: boolean;
  out_path?: string;
  byte_length?: number;
  digest?: string;
  reason?: string;
  sidecar_url?: string;
};

function isSafeFilename(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  if (name.includes("\0")) return false;
  return /^[\w.\- ()]+\.pdf$/i.test(name);
}

function assertPdfMagic(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString("utf8") === "%PDF-";
}

function atomicWrite(outPath: string, bytes: Buffer): void {
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = join(dirname(outPath), `.${basename(outPath)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, bytes, { flag: "w" });
    renameSync(tmp, outPath);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

export async function createAsiceSkeletonViaSidecar(
  input: CreateAsiceSkeletonInput
): Promise<CreateAsiceSkeletonResult> {
  const runtime = resolveDigidocRuntime();
  const allowHttp = input.allowHttpLoopback ?? resolveAllowHttpLoopback();
  const rawBase = (input.baseUrl ?? resolveDigidocSidecarUrl())?.replace(/\/$/, "");
  if (!rawBase) {
    return { ok: false, reason: "digidoc_sidecar_url_missing" };
  }
  const trusted = assertTrustedEndpoint(rawBase, {
    allowHttpLoopback: allowHttp,
    kind: "sidecar",
  });
  if (!trusted.ok) {
    return { ok: false, reason: trusted.reason };
  }
  const baseUrl = trusted.url;

  const filename = input.filename ?? basename(input.pdfPath);
  if (!isSafeFilename(filename)) {
    return { ok: false, reason: "unsafe_pdf_filename", sidecar_url: baseUrl };
  }

  const maxPdf = input.maxPdfBytes ?? runtime.max_pdf_bytes;
  const st = statSync(input.pdfPath);
  if (st.size > maxPdf) {
    return { ok: false, reason: "pdf_too_large", sidecar_url: baseUrl };
  }
  const pdfBuf = readFileSync(input.pdfPath);
  if (!assertPdfMagic(pdfBuf)) {
    return { ok: false, reason: "not_pdf_magic", sidecar_url: baseUrl };
  }

  const document = pdfBuf.toString("base64");
  const token = input.token ?? resolveDigidocSidecarToken();
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? runtime.sidecar_timeout_ms;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/container/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        filename,
        document,
        mimeType: "application/pdf",
      }),
      signal: ac.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      sidecar_url: baseUrl,
      reason: msg.includes("abort") ? "sidecar_timeout" : `sidecar_unreachable: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: { document?: string; error?: string; ok?: boolean } = {};
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    return {
      ok: false,
      sidecar_url: baseUrl,
      reason: `sidecar_non_json_${res.status}`,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, sidecar_url: baseUrl, reason: "sidecar_auth_rejected" };
  }
  if (!res.ok || !body.document) {
    return {
      ok: false,
      sidecar_url: baseUrl,
      reason: body.error ?? `sidecar_http_${res.status}`,
    };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(body.document, "base64");
  } catch {
    return { ok: false, sidecar_url: baseUrl, reason: "sidecar_invalid_base64" };
  }
  if (bytes.byteLength === 0 || bytes.byteLength > runtime.max_asice_bytes) {
    return { ok: false, sidecar_url: baseUrl, reason: "sidecar_asice_size_invalid" };
  }

  atomicWrite(input.outPath, bytes);
  const lite = inspectAsiceContainer(input.outPath, {
    maxAsiceBytes: runtime.max_asice_bytes,
  });
  if (!lite.ok) {
    try {
      unlinkSync(input.outPath);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      sidecar_url: baseUrl,
      reason: `sidecar_asice_invalid:${lite.reason}`,
    };
  }

  return {
    ok: true,
    out_path: input.outPath,
    byte_length: bytes.byteLength,
    digest: lite.container_digest,
    sidecar_url: baseUrl,
  };
}

export async function digidocSidecarHealth(
  baseUrl?: string,
  fetchImpl: typeof fetch = fetch,
  opts?: { token?: string; allowHttpLoopback?: boolean; timeoutMs?: number }
): Promise<{ ok: boolean; reason?: string; ready?: boolean }> {
  const allowHttp = opts?.allowHttpLoopback ?? resolveAllowHttpLoopback();
  const raw = (baseUrl ?? resolveDigidocSidecarUrl())?.replace(/\/$/, "");
  if (!raw) return { ok: false, reason: "digidoc_sidecar_url_missing" };
  const trusted = assertTrustedEndpoint(raw, {
    allowHttpLoopback: allowHttp,
    kind: "sidecar",
  });
  if (!trusted.ok) return { ok: false, reason: trusted.reason };
  const url = trusted.url;
  const token = opts?.token ?? resolveDigidocSidecarToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts?.timeoutMs ?? 5_000);
  try {
    const health = await fetchImpl(`${url}/health`, { headers, signal: ac.signal });
    if (!health.ok) return { ok: false, reason: `health_${health.status}` };
    const readyRes = await fetchImpl(`${url}/ready`, { headers, signal: ac.signal });
    return {
      ok: true,
      ready: readyRes.ok,
      reason: readyRes.ok ? undefined : `ready_${readyRes.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function digestFileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
