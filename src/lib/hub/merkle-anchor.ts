import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import { canonicalJson } from "../protocol/canonical.js";
import { loadHubReceipts } from "./receipt.js";
import { getHubDataDir, getHubId } from "./paths.js";
import { ensureHubSigningKey } from "./signing.js";

export interface MerkleAnchorRecord {
  date: string;
  receipt_count: number;
  merkle_root: string;
  leaf_digests: string[];
  computed_at: string;
}

export interface SignedMerkleAnchor {
  date: string;
  receipt_count: number;
  merkle_root: string;
  hub_id: string;
  computed_at: string;
  hub_signature: string;
}

function leafDigest(receipt: WitnessReceipt): string {
  return createHash("sha256")
    .update(`${receipt.event_id}:${receipt.envelope_digest}:${receipt.receipt_id}`)
    .digest("hex");
}

function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return createHash("sha256").update("empty").digest("hex");
  }
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(createHash("sha256").update(`${left}${right}`).digest("hex"));
    }
    level = next;
  }
  return level[0]!;
}

export function computeMerkleAnchorForDate(date: string): MerkleAnchorRecord {
  const receipts = loadHubReceipts().filter((r) => r.issued_at.slice(0, 10) === date);
  const leaf_digests = receipts.map(leafDigest);
  return {
    date,
    receipt_count: receipts.length,
    merkle_root: merkleRoot(leaf_digests),
    leaf_digests,
    computed_at: new Date().toISOString(),
  };
}

export function merkleAnchorDigest(anchor: Omit<SignedMerkleAnchor, "hub_signature">): string {
  return createHash("sha256").update(canonicalJson(anchor)).digest("hex");
}

export function signMerkleAnchor(record: MerkleAnchorRecord): SignedMerkleAnchor {
  const unsigned = {
    date: record.date,
    receipt_count: record.receipt_count,
    merkle_root: record.merkle_root,
    hub_id: getHubId(),
    computed_at: record.computed_at,
  };
  const digest = Buffer.from(merkleAnchorDigest(unsigned), "hex");
  const hub_signature = sign(null, digest, createPrivateKey(ensureHubSigningKey())).toString("base64");
  return { ...unsigned, hub_signature };
}

export function verifySignedMerkleAnchor(anchor: SignedMerkleAnchor, publicKeyBase64: string): boolean {
  const { hub_signature, ...unsigned } = anchor;
  const digest = Buffer.from(merkleAnchorDigest(unsigned), "hex");
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, digest, key, Buffer.from(hub_signature, "base64"));
}

export function getMerkleAnchorPath(date: string): string {
  return join(getHubDataDir(), "merkle-anchors", `${date}.json`);
}

export function saveSignedMerkleAnchor(anchor: SignedMerkleAnchor): string {
  const path = getMerkleAnchorPath(anchor.date);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(anchor, null, 2), "utf-8");
  return path;
}

export function loadSignedMerkleAnchor(date: string): SignedMerkleAnchor | undefined {
  const path = getMerkleAnchorPath(date);
  if (!existsSync(path)) return undefined;
  const raw = JSON.parse(readFileSync(path, "utf-8")) as SignedMerkleAnchor;
  if (!raw.hub_signature) return undefined;
  return raw;
}

export function ensureSignedMerkleAnchor(date: string): SignedMerkleAnchor {
  const existing = loadSignedMerkleAnchor(date);
  if (existing) return existing;
  const record = computeMerkleAnchorForDate(date);
  const signed = signMerkleAnchor(record);
  saveSignedMerkleAnchor(signed);
  return signed;
}

/** @deprecated use ensureSignedMerkleAnchor */
export function ensureMerkleAnchor(date: string): SignedMerkleAnchor {
  return ensureSignedMerkleAnchor(date);
}

export function saveMerkleAnchor(record: MerkleAnchorRecord): string {
  return saveSignedMerkleAnchor(signMerkleAnchor(record));
}

export function listSignedMerkleAnchorsSince(since?: string): SignedMerkleAnchor[] {
  const dir = join(getHubDataDir(), "merkle-anchors");
  if (!existsSync(dir)) return [];
  const anchors: SignedMerkleAnchor[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const date = file.replace(".json", "");
    if (since && date < since.slice(0, 10)) continue;
    const anchor = loadSignedMerkleAnchor(date);
    if (anchor) anchors.push(anchor);
  }
  return anchors.sort((a, b) => a.date.localeCompare(b.date));
}
