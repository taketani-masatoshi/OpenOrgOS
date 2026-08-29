import { createHash } from "node:crypto";
import { inflateRawSync, inflateSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { digestBytes } from "../document-digest.js";

/**
 * Conservative ASiC-E (.asice) structural checks without digidoc4j.
 * Full legal validation is SiVa (live). This rejects zip-bombs, traversal, and obvious corruption.
 * PDF digests are computed for store (0) and deflate (8) members with inflate size caps.
 */

const DEFAULT_MAX_ASICE_BYTES = 40 * 1024 * 1024;
const DEFAULT_MAX_UNCOMPRESSED_MEMBER = 50 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 256;
const ASICE_MIMETYPE = "application/vnd.etsi.asic-e+zip";

export type AsiceLiteResult = {
  ok: boolean;
  reason?: string;
  container_digest: string;
  byte_length: number;
  entry_names: string[];
  /** Digests of ZIP PDF members (store or inflated deflate) */
  pdf_member_digests: string[];
  has_signature_meta?: boolean;
  /** True when at least one PDF was deflate-compressed */
  had_deflated_pdf?: boolean;
};

function isUnsafeName(name: string): boolean {
  if (!name || name.length > 512) return true;
  if (name.includes("\0")) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (name.includes("..")) return true;
  return false;
}

type ZipEntry = {
  name: string;
  method: number;
  flags: number;
  compSize: number;
  uncompSize: number;
  /** Local payload bytes (raw store or compressed) */
  payload: Buffer;
};

/**
 * Parse local file headers only, with size caps. Rejects path traversal and compressed bombs.
 */
function parseLocalFileHeaders(
  buf: Buffer,
  opts: { maxEntries: number; maxUncompressed: number }
): { ok: true; entries: ZipEntry[] } | { ok: false; reason: string; entries: ZipEntry[] } {
  const out: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    if (out.length >= opts.maxEntries) {
      return { ok: false, reason: "too_many_zip_entries", entries: out };
    }
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    if (nameLen === 0) {
      return { ok: false, reason: "empty_zip_entry_name", entries: out };
    }
    // Data descriptor (bit 3): sizes absent in local header — reject for deterministic lite parse
    if ((flags & 0x8) !== 0 && (compSize === 0 || uncompSize === 0)) {
      return { ok: false, reason: "zip_data_descriptor_unsupported", entries: out };
    }
    if (offset + 30 + nameLen + extraLen + compSize > buf.length) {
      return { ok: false, reason: "zip_truncated", entries: out };
    }
    if (uncompSize > opts.maxUncompressed || compSize > opts.maxUncompressed) {
      return { ok: false, reason: "zip_member_too_large", entries: out };
    }
    if (method !== 0 && method !== 8) {
      return { ok: false, reason: `unsupported_zip_method_${method}`, entries: out };
    }
    const nameStart = offset + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf-8");
    if (isUnsafeName(name)) {
      return { ok: false, reason: "unsafe_zip_entry_name", entries: out };
    }
    const dataStart = nameStart + nameLen + extraLen;
    const payload = Buffer.from(buf.subarray(dataStart, dataStart + compSize));
    out.push({ name, method, flags, compSize, uncompSize, payload });
    offset = dataStart + compSize;
  }
  return { ok: true, entries: out };
}

/**
 * Parse the central directory, which carries authoritative sizes even when the
 * writer streams entries with data descriptors (digidoc4j does).
 */
function parseCentralDirectory(
  buf: Buffer,
  opts: { maxEntries: number; maxUncompressed: number }
): { ok: true; entries: ZipEntry[] } | { ok: false; reason: string; entries: ZipEntry[] } {
  const out: ZipEntry[] = [];
  const scanFrom = Math.max(0, buf.length - 66 * 1024);
  let eocd = -1;
  for (let i = buf.length - 22; i >= scanFrom; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, reason: "zip_eocd_not_found", entries: out };

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (count > opts.maxEntries) {
    return { ok: false, reason: "too_many_zip_entries", entries: out };
  }

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      return { ok: false, reason: "zip_central_directory_corrupt", entries: out };
    }
    const flags = buf.readUInt16LE(offset + 8);
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const uncompSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    if (nameLen === 0) {
      return { ok: false, reason: "empty_zip_entry_name", entries: out };
    }
    if (uncompSize > opts.maxUncompressed || compSize > opts.maxUncompressed) {
      return { ok: false, reason: "zip_member_too_large", entries: out };
    }
    if (method !== 0 && method !== 8) {
      return { ok: false, reason: `unsupported_zip_method_${method}`, entries: out };
    }
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf-8");
    if (isUnsafeName(name)) {
      return { ok: false, reason: "unsafe_zip_entry_name", entries: out };
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      return { ok: false, reason: "zip_local_header_missing", entries: out };
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > buf.length) {
      return { ok: false, reason: "zip_truncated", entries: out };
    }
    out.push({
      name,
      method,
      flags,
      compSize,
      uncompSize,
      payload: Buffer.from(buf.subarray(dataStart, dataStart + compSize)),
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries: out };
}

function inflateMember(
  e: ZipEntry,
  maxUncompressed: number
): { ok: true; data: Buffer } | { ok: false; reason: string } {
  if (e.method === 0) {
    return { ok: true, data: e.payload };
  }
  try {
    // Prefer zlib wrap; fall back to raw deflate
    let data: Buffer;
    try {
      data = inflateSync(e.payload, { maxOutputLength: maxUncompressed });
    } catch {
      data = inflateRawSync(e.payload, { maxOutputLength: maxUncompressed });
    }
    if (e.uncompSize > 0 && data.byteLength !== e.uncompSize) {
      // Some writers leave uncompSize=0; if set, must match
      return { ok: false, reason: "zip_inflate_size_mismatch" };
    }
    if (data.byteLength > maxUncompressed) {
      return { ok: false, reason: "zip_inflate_too_large" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "zip_inflate_failed" };
  }
}

export function inspectAsiceContainer(
  path: string,
  opts?: {
    maxAsiceBytes?: number;
    maxUncompressedMember?: number;
    maxEntries?: number;
    requireMimetype?: boolean;
  }
): AsiceLiteResult {
  const maxBytes = opts?.maxAsiceBytes ?? DEFAULT_MAX_ASICE_BYTES;
  const maxUncompressed = opts?.maxUncompressedMember ?? DEFAULT_MAX_UNCOMPRESSED_MEMBER;
  const st = statSync(path);
  const byte_length = st.size;
  if (byte_length > maxBytes) {
    return {
      ok: false,
      reason: "asice_too_large",
      container_digest: "",
      byte_length,
      entry_names: [],
      pdf_member_digests: [],
    };
  }
  const buf = readFileSync(path);
  const container_digest = createHash("sha256").update(buf).digest("hex");
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
    return {
      ok: false,
      reason: "not_zip_local_header",
      container_digest,
      byte_length,
      entry_names: [],
      pdf_member_digests: [],
    };
  }
  const limits = {
    maxEntries: opts?.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxUncompressed,
  };
  // Central directory first: streamed writers omit sizes in local headers.
  const central = parseCentralDirectory(buf, limits);
  const parsed = central.ok ? central : parseLocalFileHeaders(buf, limits);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      container_digest,
      byte_length,
      entry_names: parsed.entries.map((e) => e.name),
      pdf_member_digests: [],
    };
  }
  const entries = parsed.entries;
  const entry_names = entries.map((e) => e.name);
  if (entry_names.length === 0) {
    return {
      ok: false,
      reason: "no_zip_entries",
      container_digest,
      byte_length,
      entry_names,
      pdf_member_digests: [],
    };
  }
  const hasMeta = entry_names.some((n) => n.startsWith("META-INF/"));
  if (!hasMeta) {
    return {
      ok: false,
      reason: "missing_meta_inf",
      container_digest,
      byte_length,
      entry_names,
      pdf_member_digests: [],
    };
  }

  const requireMime = opts?.requireMimetype !== false;
  if (requireMime) {
    const mimeEntry = entries.find((e) => e.name === "mimetype");
    if (!mimeEntry || mimeEntry.method !== 0) {
      return {
        ok: false,
        reason: "missing_or_compressed_mimetype",
        container_digest,
        byte_length,
        entry_names,
        pdf_member_digests: [],
      };
    }
    const mime = mimeEntry.payload.toString("utf-8").trim();
    if (mime !== ASICE_MIMETYPE) {
      return {
        ok: false,
        reason: "invalid_asice_mimetype",
        container_digest,
        byte_length,
        entry_names,
        pdf_member_digests: [],
      };
    }
  }

  const pdf_member_digests: string[] = [];
  let had_deflated_pdf = false;
  for (const e of entries) {
    if (!/\.pdf$/i.test(e.name)) continue;
    if (e.method === 8) had_deflated_pdf = true;
    const inflated = inflateMember(e, maxUncompressed);
    if (!inflated.ok) {
      return {
        ok: false,
        reason: inflated.reason,
        container_digest,
        byte_length,
        entry_names,
        pdf_member_digests,
        had_deflated_pdf,
      };
    }
    if (inflated.data.length > 0) {
      pdf_member_digests.push(digestBytes(inflated.data).content_digest);
    }
  }
  const has_signature_meta = entry_names.some(
    (n) =>
      /^META-INF\/.*signatures.*\.xml$/i.test(n) ||
      /^META-INF\/signature.*\.xml$/i.test(n)
  );
  return {
    ok: true,
    container_digest,
    byte_length,
    entry_names,
    pdf_member_digests,
    has_signature_meta,
    had_deflated_pdf,
  };
}

/** True if a PDF member (store or inflated) matches expected source digest. */
export function asiceContainsPdfDigest(
  lite: AsiceLiteResult,
  expectedPdfDigest: string
): boolean {
  return lite.pdf_member_digests.includes(expectedPdfDigest);
}
