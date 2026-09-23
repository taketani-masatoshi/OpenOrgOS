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

const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_HEADER_BYTES = 30;
const ZIP_CENTRAL_HEADER_BYTES = 46;
const ZIP_EOCD_BYTES = 22;
/** EOCD sits within the last 64 KiB comment window plus its own fixed header. */
const ZIP_EOCD_SCAN_WINDOW = 66 * 1024;
const ZIP_FLAG_DATA_DESCRIPTOR = 0x8;
const ZIP_METHOD_STORE = 0;
const ZIP_METHOD_DEFLATE = 8;
const MAX_ENTRY_NAME_LENGTH = 512;

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

type ZipEntry = {
  name: string;
  method: number;
  flags: number;
  compSize: number;
  uncompSize: number;
  /** Local payload bytes (raw store or compressed) */
  payload: Buffer;
};

type ZipLimits = { maxEntries: number; maxUncompressed: number };

type ZipParseResult =
  | { ok: true; entries: ZipEntry[] }
  | { ok: false; reason: string; entries: ZipEntry[] };

function isUnsafeName(name: string): boolean {
  if (!name || name.length > MAX_ENTRY_NAME_LENGTH) return true;
  if (name.includes("\0")) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (name.includes("..")) return true;
  return false;
}

/** Size cap → compression method → name safety; shared by local and central headers. */
function entryHeaderRejection(
  entry: { method: number; compSize: number; uncompSize: number; name: string },
  limits: ZipLimits,
): string | null {
  if (entry.uncompSize > limits.maxUncompressed || entry.compSize > limits.maxUncompressed) {
    return "zip_member_too_large";
  }
  if (entry.method !== ZIP_METHOD_STORE && entry.method !== ZIP_METHOD_DEFLATE) {
    return `unsupported_zip_method_${entry.method}`;
  }
  if (isUnsafeName(entry.name)) return "unsafe_zip_entry_name";
  return null;
}

/**
 * Parse local file headers only, with size caps. Rejects path traversal and compressed bombs.
 */
function parseLocalFileHeaders(buf: Buffer, limits: ZipLimits): ZipParseResult {
  const out: ZipEntry[] = [];
  let offset = 0;
  while (offset + ZIP_LOCAL_HEADER_BYTES <= buf.length) {
    if (buf.readUInt32LE(offset) !== ZIP_LOCAL_HEADER_SIGNATURE) break;
    if (out.length >= limits.maxEntries) {
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
    if ((flags & ZIP_FLAG_DATA_DESCRIPTOR) !== 0 && (compSize === 0 || uncompSize === 0)) {
      return { ok: false, reason: "zip_data_descriptor_unsupported", entries: out };
    }
    if (offset + ZIP_LOCAL_HEADER_BYTES + nameLen + extraLen + compSize > buf.length) {
      return { ok: false, reason: "zip_truncated", entries: out };
    }
    const nameStart = offset + ZIP_LOCAL_HEADER_BYTES;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf-8");
    const rejection = entryHeaderRejection({ method, compSize, uncompSize, name }, limits);
    if (rejection) return { ok: false, reason: rejection, entries: out };
    const dataStart = nameStart + nameLen + extraLen;
    const payload = Buffer.from(buf.subarray(dataStart, dataStart + compSize));
    out.push({ name, method, flags, compSize, uncompSize, payload });
    offset = dataStart + compSize;
  }
  return { ok: true, entries: out };
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const scanFrom = Math.max(0, buf.length - ZIP_EOCD_SCAN_WINDOW);
  for (let i = buf.length - ZIP_EOCD_BYTES; i >= scanFrom; i -= 1) {
    if (buf.readUInt32LE(i) === ZIP_EOCD_SIGNATURE) return i;
  }
  return -1;
}

/**
 * Parse the central directory, which carries authoritative sizes even when the
 * writer streams entries with data descriptors (digidoc4j does).
 */
function parseCentralDirectory(buf: Buffer, limits: ZipLimits): ZipParseResult {
  const out: ZipEntry[] = [];
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) return { ok: false, reason: "zip_eocd_not_found", entries: out };

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (count > limits.maxEntries) {
    return { ok: false, reason: "too_many_zip_entries", entries: out };
  }

  for (let i = 0; i < count; i += 1) {
    if (
      offset + ZIP_CENTRAL_HEADER_BYTES > buf.length ||
      buf.readUInt32LE(offset) !== ZIP_CENTRAL_HEADER_SIGNATURE
    ) {
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
    const nameStart = offset + ZIP_CENTRAL_HEADER_BYTES;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf-8");
    const rejection = entryHeaderRejection({ method, compSize, uncompSize, name }, limits);
    if (rejection) return { ok: false, reason: rejection, entries: out };
    if (
      localOffset + ZIP_LOCAL_HEADER_BYTES > buf.length ||
      buf.readUInt32LE(localOffset) !== ZIP_LOCAL_HEADER_SIGNATURE
    ) {
      return { ok: false, reason: "zip_local_header_missing", entries: out };
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + ZIP_LOCAL_HEADER_BYTES + localNameLen + localExtraLen;
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
    offset += ZIP_CENTRAL_HEADER_BYTES + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries: out };
}

function inflateMember(
  e: ZipEntry,
  maxUncompressed: number
): { ok: true; data: Buffer } | { ok: false; reason: string } {
  if (e.method === ZIP_METHOD_STORE) {
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

function rejectedContainer(
  reason: string,
  facts: {
    container_digest: string;
    byte_length: number;
    entry_names?: string[];
    pdf_member_digests?: string[];
    had_deflated_pdf?: boolean;
  },
): AsiceLiteResult {
  return {
    ok: false,
    reason,
    container_digest: facts.container_digest,
    byte_length: facts.byte_length,
    entry_names: facts.entry_names ?? [],
    pdf_member_digests: facts.pdf_member_digests ?? [],
    ...(facts.had_deflated_pdf === undefined
      ? {}
      : { had_deflated_pdf: facts.had_deflated_pdf }),
  };
}

function asiceMimetypeRejection(entries: ZipEntry[]): string | null {
  const mimeEntry = entries.find((e) => e.name === "mimetype");
  if (!mimeEntry || mimeEntry.method !== ZIP_METHOD_STORE) {
    return "missing_or_compressed_mimetype";
  }
  const mime = mimeEntry.payload.toString("utf-8").trim();
  return mime === ASICE_MIMETYPE ? null : "invalid_asice_mimetype";
}

type PdfMemberDigests =
  | { ok: true; digests: string[]; had_deflated_pdf: boolean }
  | { ok: false; reason: string; digests: string[]; had_deflated_pdf: boolean };

function digestPdfMembers(entries: ZipEntry[], maxUncompressed: number): PdfMemberDigests {
  const digests: string[] = [];
  let had_deflated_pdf = false;
  for (const e of entries) {
    if (!/\.pdf$/i.test(e.name)) continue;
    if (e.method === ZIP_METHOD_DEFLATE) had_deflated_pdf = true;
    const inflated = inflateMember(e, maxUncompressed);
    if (!inflated.ok) {
      return { ok: false, reason: inflated.reason, digests, had_deflated_pdf };
    }
    if (inflated.data.length > 0) {
      digests.push(digestBytes(inflated.data).content_digest);
    }
  }
  return { ok: true, digests, had_deflated_pdf };
}

function hasSignatureMeta(entryNames: string[]): boolean {
  return entryNames.some(
    (n) =>
      /^META-INF\/.*signatures.*\.xml$/i.test(n) ||
      /^META-INF\/signature.*\.xml$/i.test(n)
  );
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
  const byte_length = statSync(path).size;
  if (byte_length > maxBytes) {
    return rejectedContainer("asice_too_large", { container_digest: "", byte_length });
  }
  const buf = readFileSync(path);
  const container_digest = createHash("sha256").update(buf).digest("hex");
  if (buf.length < 4 || buf.readUInt32LE(0) !== ZIP_LOCAL_HEADER_SIGNATURE) {
    return rejectedContainer("not_zip_local_header", { container_digest, byte_length });
  }
  const limits = {
    maxEntries: opts?.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxUncompressed,
  };
  // Central directory first: streamed writers omit sizes in local headers.
  const central = parseCentralDirectory(buf, limits);
  const parsed = central.ok ? central : parseLocalFileHeaders(buf, limits);
  if (!parsed.ok) {
    return rejectedContainer(parsed.reason, {
      container_digest,
      byte_length,
      entry_names: parsed.entries.map((e) => e.name),
    });
  }
  const entries = parsed.entries;
  const entry_names = entries.map((e) => e.name);
  const facts = { container_digest, byte_length, entry_names };
  if (entry_names.length === 0) {
    return rejectedContainer("no_zip_entries", facts);
  }
  if (!entry_names.some((n) => n.startsWith("META-INF/"))) {
    return rejectedContainer("missing_meta_inf", facts);
  }
  if (opts?.requireMimetype !== false) {
    const mimeRejection = asiceMimetypeRejection(entries);
    if (mimeRejection) return rejectedContainer(mimeRejection, facts);
  }

  const pdfMembers = digestPdfMembers(entries, maxUncompressed);
  if (!pdfMembers.ok) {
    return rejectedContainer(pdfMembers.reason, {
      ...facts,
      pdf_member_digests: pdfMembers.digests,
      had_deflated_pdf: pdfMembers.had_deflated_pdf,
    });
  }
  return {
    ok: true,
    container_digest,
    byte_length,
    entry_names,
    pdf_member_digests: pdfMembers.digests,
    has_signature_meta: hasSignatureMeta(entry_names),
    had_deflated_pdf: pdfMembers.had_deflated_pdf,
  };
}

/** True if a PDF member (store or inflated) matches expected source digest. */
export function asiceContainsPdfDigest(
  lite: AsiceLiteResult,
  expectedPdfDigest: string
): boolean {
  return lite.pdf_member_digests.includes(expectedPdfDigest);
}
