import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadCompanyEventChain } from "./company-events-chain.js";
import { loadCompanyEventsAttestations } from "./company-events-attestation.js";
import { loadCompanyEvents } from "./company-events.js";
import {
  getTrustedAttestationPublicKeys,
  loadCompanyEventsSigningMeta,
} from "./company-events-signing.js";
import { canonicalJson } from "./protocol/canonical.js";
import { loadCompanyEventsWitnessPin } from "./company-events-witness-pin.js";
import { getDataDir, toLogicalPath } from "./utils.js";

const VERIFY_BUNDLE_SCRIPT = `#!/usr/bin/env node
/**
 * Standalone company-events audit bundle verifier (Node.js stdlib only).
 * Usage: node verify-bundle.mjs
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

function sortKeys(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeys(value[key]);
  }
  return sorted;
}

function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

function loadJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildPayloadDigest(link, registryById) {
  const event = registryById.get(link.event_id);
  let payload;
  if (link.action === "create" && event) {
    payload = {
      action: "create",
      event_id: event.id,
      occurred_at: event.occurred_at,
      kind: event.kind,
      title: event.title,
      status: event.status === "voided" ? "open" : event.status,
    };
  } else if (link.action === "void" && event?.kind === "void") {
    payload = {
      action: "void",
      event_id: link.event_id,
      target_event_id: event.target_event_id ?? link.target_event_id,
      reason: event.void_reason ?? "",
    };
  } else if (link.action === "status" && event) {
    payload = {
      action: "status",
      event_id: link.event_id,
      status: event.status,
      closed_at: event.closed_at,
    };
  } else {
    return null;
  }
  return sha256Hex(canonicalJson(payload));
}

function verifyChainRecords(chain) {
  const issues = [];
  let prevDigest = null;
  let expectedSeq = 1;
  let prevRecordedAt = null;
  for (const link of chain) {
    if (link.seq !== expectedSeq) {
      issues.push(\`seq gap at \${link.seq}\`);
    }
    if (link.link_id !== \`CEL-\${link.seq}\`) {
      issues.push(\`link_id mismatch at seq \${link.seq}\`);
    }
    if (link.prev_digest !== prevDigest) {
      issues.push(\`prev_digest mismatch at seq \${link.seq}\`);
    }
    const linkSans = { ...link };
    delete linkSans.digest;
    const seed = prevDigest ?? "genesis";
    const expectedDigest = sha256Hex(seed + canonicalJson(linkSans));
    if (link.digest !== expectedDigest) {
      issues.push(\`digest mismatch at seq \${link.seq}\`);
    }
    if (prevRecordedAt && link.recorded_at < prevRecordedAt) {
      issues.push(\`recorded_at not monotonic at seq \${link.seq}\`);
    }
    expectedSeq = link.seq + 1;
    prevDigest = link.digest;
    prevRecordedAt = link.recorded_at;
  }
  return issues;
}

function crossCheckRegistry(chain, registryEvents) {
  const issues = [];
  const registryById = new Map(registryEvents.map((e) => [e.id, e]));
  const createLinks = chain.filter((l) => l.action === "create");
  const createByEventId = new Map();
  for (const link of createLinks) {
    if (createByEventId.has(link.event_id)) {
      issues.push(\`duplicate create for \${link.event_id} at seq \${link.seq}\`);
      continue;
    }
    createByEventId.set(link.event_id, link);
  }
  for (const event of registryEvents) {
    const createLink = createByEventId.get(event.id);
    if (!createLink) {
      issues.push(\`missing create link for registry event \${event.id}\`);
      continue;
    }
    if (event.chain_seq !== undefined && event.chain_seq !== createLink.seq) {
      issues.push(\`chain_seq mismatch for \${event.id}\`);
    }
    const expectedPayload = buildPayloadDigest(createLink, registryById);
    if (expectedPayload && createLink.payload_digest !== expectedPayload) {
      issues.push(\`create payload_digest mismatch for \${event.id}\`);
    }
  }
  for (const link of createLinks) {
    if (!registryById.has(link.event_id)) {
      issues.push(\`orphan create at seq \${link.seq} for \${link.event_id}\`);
    }
  }
  return issues;
}

function verifyWitnessPin(chain, pinPath) {
  if (!existsSync(pinPath)) return [];
  const pin = loadJson(pinPath);
  const tail = chain.at(-1);
  if (!tail) return ["witness pin present but chain empty"];
  const issues = [];
  if (pin.chain_tail_digest !== tail.digest) {
    issues.push("witness pin digest mismatch");
  }
  if (pin.chain_tail_seq !== tail.seq) {
    issues.push("witness pin seq mismatch");
  }
  return issues;
}

function verifyAttestations(atts, trustedKeys) {
  const issues = [];
  for (const att of atts) {
    if (!trustedKeys.includes(att.public_key)) {
      issues.push(\`untrusted key for \${att.attestation_id}\`);
      continue;
    }
    const { signature, public_key, payload_digest, signed_at, key_id, ...rest } = att;
    void signature;
    void public_key;
    void payload_digest;
    void signed_at;
    void key_id;
    const expected = sha256Hex(canonicalJson(rest));
    if (expected !== payload_digest) {
      issues.push(\`payload_digest mismatch for \${att.attestation_id}\`);
      continue;
    }
    const key = createPublicKey({
      key: Buffer.from(public_key, "base64"),
      format: "der",
      type: "spki",
    });
    const ok = verify(null, Buffer.from(payload_digest, "hex"), key, Buffer.from(signature, "base64"));
    if (!ok) issues.push(\`signature invalid for \${att.attestation_id}\`);
  }
  return issues;
}

function verifyAttestationSequence(atts) {
  if (atts.length === 0) return [];
  const issues = [];
  const byId = new Map(atts.map((a) => [a.attestation_id, a]));
  const sorted = [...atts].sort(
    (a, b) => a.signed_at.localeCompare(b.signed_at) || a.attestation_id.localeCompare(b.attestation_id)
  );
  const prevFork = new Map();
  for (const att of atts) {
    if (!att.prev_attestation_id) continue;
    prevFork.set(att.prev_attestation_id, (prevFork.get(att.prev_attestation_id) ?? 0) + 1);
  }
  for (const [prevId, count] of prevFork) {
    if (count > 1) issues.push(\`attestation prev fork: \${count} claim \${prevId}\`);
  }
  for (let i = 0; i < sorted.length; i++) {
    const att = sorted[i];
    if (!att.prev_attestation_id) {
      if (i > 0) issues.push(\`attestation \${att.attestation_id} missing prev link\`);
      continue;
    }
    const prev = byId.get(att.prev_attestation_id);
    if (!prev) {
      issues.push(\`attestation \${att.attestation_id} orphan prev \${att.prev_attestation_id}\`);
      continue;
    }
    if (prev.signed_at > att.signed_at) {
      issues.push(\`attestation \${att.attestation_id} prev signed after current\`);
    }
    if (att.chain_tail_seq != null && prev.chain_tail_seq != null && att.chain_tail_seq < prev.chain_tail_seq) {
      issues.push(\`attestation \${att.attestation_id} tail seq regression\`);
    }
    if (att.chain_tail_seq != null && prev.chain_tail_seq != null && att.links_since_prev != null) {
      const expected = Math.max(0, att.chain_tail_seq - prev.chain_tail_seq);
      if (att.links_since_prev !== expected) {
        issues.push(\`attestation \${att.attestation_id} links_since_prev mismatch\`);
      }
    }
  }
  return issues;
}

function main() {
  const chain = loadJsonl(join(__dir, "chain.jsonl"));
  const attestations = loadJsonl(join(__dir, "attestations.jsonl"));
  const registryAudit = loadJson(join(__dir, "registry-audit.json"));
  const signingKeys = loadJson(join(__dir, "signing-keys.json"));

  const registryById = new Map(registryAudit.events.map((e) => [e.id, e]));
  const trustedKeys = [
    signingKeys.active?.public_key,
    ...(signingKeys.history ?? []).map((k) => k.public_key),
  ].filter(Boolean);

  const chainIssues = [
    ...verifyChainRecords(chain),
    ...crossCheckRegistry(chain, registryAudit.events),
  ];
  const attIssues = [
    ...verifyAttestations(attestations, trustedKeys),
    ...verifyAttestationSequence(attestations),
  ];
  const pinIssues = verifyWitnessPin(chain, join(__dir, "witness-pin.json"));

  const all = [...chainIssues, ...attIssues, ...pinIssues];
  if (all.length) {
    console.error("FAIL");
    for (const i of all) console.error(" ", i);
    process.exit(1);
  }
  console.log("PASS — chain + registry cross-check + attestations verified");
}

main();
`;

function buildRegistryAuditSubset(): {
  schema_version: number;
  exported_at: string;
  events: Array<Record<string, unknown>>;
} {
  const registry = loadCompanyEvents();
  return {
    schema_version: registry.schema_version,
    exported_at: new Date().toISOString(),
    events: registry.events.map((event) => ({
      id: event.id,
      occurred_at: event.occurred_at,
      month: event.month,
      kind: event.kind,
      title: event.title,
      status: event.status,
      chain_seq: event.chain_seq,
      closed_at: event.closed_at,
      target_event_id: event.target_event_id,
      void_reason: event.void_reason,
      voided_by: event.voided_by,
      voided_at: event.voided_at,
      related_digest: event.related
        ? createHash("sha256").update(canonicalJson(event.related)).digest("hex")
        : undefined,
      notes_digest: event.notes
        ? createHash("sha256").update(event.notes).digest("hex")
        : undefined,
    })),
  };
}

export interface ExportCompanyEventsBundleResult {
  out_dir: string;
  files: string[];
}

export function exportCompanyEventsAuditBundle(outDir: string): ExportCompanyEventsBundleResult {
  mkdirSync(outDir, { recursive: true });

  const chainPath = join(getDataDir(), "company-events-chain.jsonl");
  const attPath = join(getDataDir(), "company-events-attestations.jsonl");

  const files: string[] = [];

  if (existsSync(chainPath)) {
    const dest = join(outDir, "chain.jsonl");
    cpSync(chainPath, dest);
    files.push("chain.jsonl");
  } else {
    writeFileSync(join(outDir, "chain.jsonl"), "");
    files.push("chain.jsonl");
  }

  if (existsSync(attPath)) {
    const dest = join(outDir, "attestations.jsonl");
    cpSync(attPath, dest);
    files.push("attestations.jsonl");
  } else {
    writeFileSync(join(outDir, "attestations.jsonl"), "");
    files.push("attestations.jsonl");
  }

  const meta = loadCompanyEventsSigningMeta();
  const signingKeys = {
    active: meta?.active,
    history: meta?.history ?? [],
    trusted_public_keys: getTrustedAttestationPublicKeys(),
  };
  writeFileSync(join(outDir, "signing-keys.json"), JSON.stringify(signingKeys, null, 2));
  files.push("signing-keys.json");

  const registryAudit = buildRegistryAuditSubset();
  writeFileSync(join(outDir, "registry-audit.json"), JSON.stringify(registryAudit, null, 2));
  files.push("registry-audit.json");

  const witnessPin = loadCompanyEventsWitnessPin();
  if (witnessPin) {
    writeFileSync(join(outDir, "witness-pin.json"), JSON.stringify(witnessPin, null, 2));
    files.push("witness-pin.json");
  }

  writeFileSync(join(outDir, "verify-bundle.mjs"), VERIFY_BUNDLE_SCRIPT, { mode: 0o755 });
  files.push("verify-bundle.mjs");

  const verifyMd = [
    "# Company Events Audit Bundle",
    "",
    "Standalone verification (no orgos required):",
    "",
    "```bash",
    "node verify-bundle.mjs",
    "```",
    "",
    "## Contents",
    "",
    "| File | Description |",
    "|------|-------------|",
    "| chain.jsonl | Append-only hash chain |",
    "| attestations.jsonl | Weekly Ed25519 batch signatures |",
    "| signing-keys.json | Trusted public keys (active + history) |",
    "| registry-audit.json | L0/L1 audit subset (notes/related as digests only) |",
    "| witness-pin.json | Optional chain tail pin (if exported) |",
    "",
    `Exported: ${registryAudit.exported_at}`,
    `Chain links: ${loadCompanyEventChain().length}`,
    `Attestations: ${loadCompanyEventsAttestations().length}`,
    "",
  ].join("\n");
  writeFileSync(join(outDir, "VERIFY.md"), verifyMd);
  files.push("VERIFY.md");

  return { out_dir: toLogicalPath(outDir), files };
}
