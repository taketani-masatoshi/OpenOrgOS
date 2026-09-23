import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { etaxError } from "../../../schemas/etax/errors.js";

const MSCF = Buffer.from("MSCF");
const MSZIP_CK = Buffer.from("CK");
const PREV_CABINET = 0x0001;
const NEXT_CABINET = 0x0002;
const RESERVE_PRESENT = 0x0004;
const COMPRESS_NONE = 0;
const COMPRESS_MSZIP = 1;

export interface CabFileEntry {
  originalName: string;
  relativePath: string;
  bytes: number;
}

export interface CabUnpackResult {
  fileCount: number;
  files: CabFileEntry[];
}

function readCString(buf: Buffer, start: { o: number }): Buffer {
  const s = start.o;
  while (start.o < buf.length && buf[start.o] !== 0) start.o += 1;
  const raw = buf.subarray(s, start.o);
  start.o += 1;
  return raw;
}

function decodeCabName(raw: Buffer): string {
  try {
    return new TextDecoder("shift_jis").decode(raw);
  } catch {
    return raw.toString("latin1");
  }
}

/** Keep ASCII directory segments; strip non-ASCII from the leaf so SJIS paths are writable. */
export function asciiSafeRelativePath(originalName: string, used: Set<string>): string {
  const parts = originalName.replaceAll("/", "\\").split("\\").filter(Boolean);
  const isSafeSeg = (part: string): boolean =>
    /^[\x20-\x7E]+$/.test(part) && part !== "." && part !== ".." && !part.includes(":");
  const dirs = parts.slice(0, -1).filter(isSafeSeg);
  const leaf = parts.at(-1) ?? "file";
  const strippedLeaf = leaf.replace(/[^\x20-\x7E._-]/g, "") || "file";
  const safeLeaf = isSafeSeg(strippedLeaf) ? strippedLeaf : "file";
  let rel = [...dirs, safeLeaf].join("/");
  if (used.has(rel)) {
    const tag = createHash("sha256").update(originalName).digest("hex").slice(0, 8);
    rel = [...dirs, `${tag}-${safeLeaf}`].join("/");
  }
  used.add(rel);
  return rel;
}

function inflateFolder(
  buf: Buffer,
  folder: {
    coffCabStart: number;
    cCFData: number;
    typeCompress: number;
    cbCFData: number;
  }
): Buffer {
  let o = folder.coffCabStart;
  const chunks: Buffer[] = [];
  let history = Buffer.alloc(0);
  for (let i = 0; i < folder.cCFData; i += 1) {
    o += 4;
    const cbData = buf.readUInt16LE(o);
    o += 2;
    const cbUncomp = buf.readUInt16LE(o);
    o += 2;
    o += folder.cbCFData;
    const ab = buf.subarray(o, o + cbData);
    o += cbData;
    let raw: Buffer;
    if (folder.typeCompress === COMPRESS_NONE) {
      raw = Buffer.from(ab);
    } else if (folder.typeCompress === COMPRESS_MSZIP) {
      if (ab.subarray(0, 2).compare(MSZIP_CK) !== 0) {
        throw etaxError({
          code: "ETAX_CAB_MSZIP_INVALID",
          blocked: "SPEC_BLOCKED",
          message: `MSZIP CK signature missing at CFDATA block ${i}`,
        });
      }
      const payload = ab.subarray(2);
      const dict = history.length > 32768 ? history.subarray(history.length - 32768) : history;
      try {
        raw = inflateRawSync(payload, dict.length ? { dictionary: dict } : {});
      } catch {
        raw = inflateRawSync(payload);
      }
    } else {
      throw etaxError({
        code: "ETAX_CAB_COMPRESSION_UNSUPPORTED",
        blocked: "SPEC_BLOCKED",
        message: `CAB compression type ${folder.typeCompress} is not MSZIP/none`,
      });
    }
    if (raw.length !== cbUncomp) {
      throw etaxError({
        code: "ETAX_CAB_BLOCK_SIZE_MISMATCH",
        blocked: "SPEC_BLOCKED",
        message: `CFDATA block ${i} inflated ${raw.length} bytes, expected ${cbUncomp}`,
      });
    }
    chunks.push(raw);
    history = Buffer.concat([
      history.length > 32768 ? history.subarray(history.length - 32768) : history,
      raw,
    ]);
  }
  return Buffer.concat(chunks);
}

export function unpackMicrosoftCab(cabPath: string, destDir: string): CabUnpackResult {
  const buf = readFileSync(cabPath);
  if (buf.subarray(0, 4).compare(MSCF) !== 0) {
    throw etaxError({
      code: "ETAX_CAB_NOT_MSCF",
      blocked: "SPEC_BLOCKED",
      message: `Not a Microsoft Cabinet: ${cabPath}`,
    });
  }
  const coffFiles = buf.readUInt32LE(16);
  const cFolders = buf.readUInt16LE(26);
  const cFiles = buf.readUInt16LE(28);
  const flags = buf.readUInt16LE(30);
  const cur = { o: 36 };
  let cbCFFolder = 0;
  let cbCFData = 0;
  if (flags & RESERVE_PRESENT) {
    const cbCFHeader = buf.readUInt16LE(cur.o);
    cur.o += 2;
    cbCFFolder = buf[cur.o] ?? 0;
    cur.o += 1;
    cbCFData = buf[cur.o] ?? 0;
    cur.o += 1;
    cur.o += cbCFHeader;
  }
  if (flags & PREV_CABINET) {
    readCString(buf, cur);
    readCString(buf, cur);
  }
  if (flags & NEXT_CABINET) {
    readCString(buf, cur);
    readCString(buf, cur);
  }
  const folders: Array<{
    coffCabStart: number;
    cCFData: number;
    typeCompress: number;
    cbCFData: number;
  }> = [];
  for (let i = 0; i < cFolders; i += 1) {
    folders.push({
      coffCabStart: buf.readUInt32LE(cur.o),
      cCFData: buf.readUInt16LE(cur.o + 4),
      typeCompress: buf.readUInt16LE(cur.o + 6),
      cbCFData,
    });
    cur.o += 8 + cbCFFolder;
  }
  cur.o = coffFiles;
  const files: Array<{
    cbFile: number;
    uoffFolderStart: number;
    iFolder: number;
    name: string;
  }> = [];
  for (let i = 0; i < cFiles; i += 1) {
    const cbFile = buf.readUInt32LE(cur.o);
    const uoffFolderStart = buf.readUInt32LE(cur.o + 4);
    const iFolder = buf.readUInt16LE(cur.o + 8);
    cur.o += 16;
    files.push({
      cbFile,
      uoffFolderStart,
      iFolder,
      name: decodeCabName(readCString(buf, cur)),
    });
  }
  const folderData = folders.map((folder) => inflateFolder(buf, folder));
  const used = new Set<string>();
  const written: CabFileEntry[] = [];
  for (const file of files) {
    const folderBuf = folderData[file.iFolder];
    if (!folderBuf) {
      throw etaxError({
        code: "ETAX_CAB_FOLDER_INDEX",
        blocked: "SPEC_BLOCKED",
        message: `CAB file ${file.name} references missing folder ${file.iFolder}`,
      });
    }
    const rel = asciiSafeRelativePath(file.name, used);
    const dest = join(destDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const slice = folderBuf.subarray(file.uoffFolderStart, file.uoffFolderStart + file.cbFile);
    writeFileSync(dest, slice);
    written.push({ originalName: file.name, relativePath: rel, bytes: slice.length });
  }
  return { fileCount: written.length, files: written };
}
