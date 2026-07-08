import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  companyEventChainLinkSchema,
  type CompanyEventChainLink,
} from "../../schemas/company-events-chain.js";
import type { CompanyEvent, CompanyEventsRegistry } from "../../schemas/company-events.js";
import { canonicalJson } from "./protocol/canonical.js";
import { appendJsonl, loadJsonl } from "./jsonl-store.js";
import { getDataDir, toLogicalPath } from "./utils.js";

const CHAIN_GENESIS = "genesis";

const CHAIN_PATH = () => join(getDataDir(), "company-events-chain.jsonl");

export function companyEventChainPath(): string {
  return toLogicalPath(CHAIN_PATH());
}

export function loadCompanyEventChain(): CompanyEventChainLink[] {
  return loadJsonl(CHAIN_PATH(), (raw) => companyEventChainLinkSchema.parse(raw));
}

export interface CreateChainPayloadInput {
  action: "create";
  event: Pick<CompanyEvent, "id" | "occurred_at" | "kind" | "title" | "status">;
}

export interface VoidChainPayloadInput {
  action: "void";
  eventId: string;
  targetEventId: string;
  reason: string;
}

export type ChainPayloadInput = CreateChainPayloadInput | VoidChainPayloadInput;

export function buildChainPayloadDigest(input: ChainPayloadInput): string {
  const payload =
    input.action === "create"
      ? {
          action: input.action,
          event_id: input.event.id,
          occurred_at: input.event.occurred_at,
          kind: input.event.kind,
          title: input.event.title,
          status: input.event.status,
        }
      : {
          action: input.action,
          event_id: input.eventId,
          target_event_id: input.targetEventId,
          reason: input.reason,
        };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function buildLinkDigest(
  prevDigest: string | null,
  link: Omit<CompanyEventChainLink, "digest">
): string {
  const seed = prevDigest ?? CHAIN_GENESIS;
  return createHash("sha256").update(seed + canonicalJson(link)).digest("hex");
}

export function appendChainLink(input: ChainPayloadInput): CompanyEventChainLink {
  mkdirSync(join(CHAIN_PATH(), ".."), { recursive: true });
  const chain = loadCompanyEventChain();
  const prev = chain.length > 0 ? chain[chain.length - 1] : undefined;
  const seq = (prev?.seq ?? 0) + 1;
  const payload_digest = buildChainPayloadDigest(input);
  const event_id = input.action === "create" ? input.event.id : input.eventId;
  const target_event_id = input.action === "void" ? input.targetEventId : undefined;

  const linkSansDigest: Omit<CompanyEventChainLink, "digest"> = {
    seq,
    link_id: `CEL-${seq}`,
    action: input.action,
    event_id,
    target_event_id,
    prev_digest: prev?.digest ?? null,
    payload_digest,
    recorded_at: new Date().toISOString(),
  };

  const link = companyEventChainLinkSchema.parse({
    ...linkSansDigest,
    digest: buildLinkDigest(prev?.digest ?? null, linkSansDigest),
  });

  appendJsonl(CHAIN_PATH(), link);
  return link;
}

export interface ChainVerifyIssue {
  code: string;
  message: string;
  seq?: number;
  event_id?: string;
}

export function verifyCompanyEventChainRecords(
  chain: CompanyEventChainLink[]
): { ok: boolean; issues: ChainVerifyIssue[]; checked: number } {
  const issues: ChainVerifyIssue[] = [];
  let expectedSeq = 1;
  let prevDigest: string | null = null;

  for (const link of chain) {
    if (link.seq !== expectedSeq) {
      issues.push({
        code: "chain-seq-gap",
        message: `Expected seq ${expectedSeq}, got ${link.seq}`,
        seq: link.seq,
        event_id: link.event_id,
      });
    }

    if (link.prev_digest !== prevDigest) {
      issues.push({
        code: "chain-prev-mismatch",
        message: `prev_digest mismatch at seq ${link.seq}: expected ${prevDigest ?? "(none)"}, got ${link.prev_digest ?? "(none)"}`,
        seq: link.seq,
        event_id: link.event_id,
      });
    }

    const linkSansDigest: Omit<CompanyEventChainLink, "digest"> = {
      seq: link.seq,
      link_id: link.link_id,
      action: link.action,
      event_id: link.event_id,
      target_event_id: link.target_event_id,
      prev_digest: link.prev_digest,
      payload_digest: link.payload_digest,
      recorded_at: link.recorded_at,
    };
    const expectedDigest = buildLinkDigest(prevDigest, linkSansDigest);
    if (link.digest !== expectedDigest) {
      issues.push({
        code: "chain-digest-mismatch",
        message: `digest mismatch at seq ${link.seq}`,
        seq: link.seq,
        event_id: link.event_id,
      });
    }

    if (link.action === "void" && !link.target_event_id) {
      issues.push({
        code: "chain-void-target-missing",
        message: `void link at seq ${link.seq} missing target_event_id`,
        seq: link.seq,
        event_id: link.event_id,
      });
    }

    expectedSeq = link.seq + 1;
    prevDigest = link.digest;
  }

  return { ok: issues.length === 0, issues, checked: chain.length };
}

export function verifyCompanyEventChain(): {
  ok: boolean;
  issues: ChainVerifyIssue[];
  checked: number;
} {
  return verifyCompanyEventChainRecords(loadCompanyEventChain());
}

export function crossCheckChainWithRegistry(
  registry: CompanyEventsRegistry,
  chain: CompanyEventChainLink[] = loadCompanyEventChain()
): ChainVerifyIssue[] {
  const issues: ChainVerifyIssue[] = [];
  const registryById = new Map(registry.events.map((e) => [e.id, e]));
  const createLinks = chain.filter((l) => l.action === "create");
  const voidLinks = chain.filter((l) => l.action === "void");

  const createByEventId = new Map<string, CompanyEventChainLink>();
  for (const link of createLinks) {
    if (createByEventId.has(link.event_id)) {
      issues.push({
        code: "chain-duplicate-create",
        message: `Duplicate create link for event ${link.event_id}`,
        seq: link.seq,
        event_id: link.event_id,
      });
      continue;
    }
    createByEventId.set(link.event_id, link);
  }

  for (const event of registry.events) {
    const createLink = createByEventId.get(event.id);
    if (!createLink) {
      issues.push({
        code: "chain-missing-create",
        message: `Registry event ${event.id} has no create chain link`,
        event_id: event.id,
      });
      continue;
    }
    if (event.chain_seq !== undefined && event.chain_seq !== createLink.seq) {
      issues.push({
        code: "chain-seq-registry-mismatch",
        message: `Event ${event.id} chain_seq ${event.chain_seq} != create link seq ${createLink.seq}`,
        event_id: event.id,
        seq: createLink.seq,
      });
    }
  }

  for (const link of createLinks) {
    if (!registryById.has(link.event_id)) {
      issues.push({
        code: "chain-orphan-create",
        message: `Create link seq ${link.seq} references missing registry event ${link.event_id}`,
        seq: link.seq,
        event_id: link.event_id,
      });
    }
  }

  for (const link of voidLinks) {
    const targetId = link.target_event_id;
    if (!targetId) continue;
    const target = registryById.get(targetId);
    if (!target) {
      issues.push({
        code: "chain-void-target-missing-registry",
        message: `Void link seq ${link.seq} targets missing event ${targetId}`,
        seq: link.seq,
        event_id: targetId,
      });
      continue;
    }
    if (target.status !== "voided") {
      issues.push({
        code: "chain-void-status-mismatch",
        message: `Void link exists for ${targetId} but registry status is ${target.status}`,
        event_id: targetId,
        seq: link.seq,
      });
    }
    if (target.voided_by && target.voided_by !== link.event_id) {
      issues.push({
        code: "chain-voided-by-mismatch",
        message: `Event ${targetId} voided_by ${target.voided_by} != void link event ${link.event_id}`,
        event_id: targetId,
        seq: link.seq,
      });
    }
  }

  for (const event of registry.events) {
    if (event.status !== "voided") continue;
    const voidLink = voidLinks.find((l) => l.target_event_id === event.id);
    if (!voidLink) {
      issues.push({
        code: "chain-missing-void",
        message: `Registry event ${event.id} is voided but has no void chain link`,
        event_id: event.id,
      });
    }
    if (event.kind !== "void" && !event.voided_by) {
      issues.push({
        code: "chain-voided-by-missing",
        message: `Voided event ${event.id} missing voided_by`,
        event_id: event.id,
      });
    }
  }

  return issues;
}

export function validateCompanyEventChainWithRegistry(
  registry: CompanyEventsRegistry
): {
  ok: boolean;
  issues: ChainVerifyIssue[];
} {
  const chain = loadCompanyEventChain();
  const chainVerify = verifyCompanyEventChainRecords(chain);
  const crossIssues = crossCheckChainWithRegistry(registry, chain);
  const issues: ChainVerifyIssue[] = [...chainVerify.issues, ...crossIssues];
  return { ok: chainVerify.ok && crossIssues.length === 0, issues };
}

export function getCompanyEventChainTail(): CompanyEventChainLink | undefined {
  const chain = loadCompanyEventChain();
  return chain.length > 0 ? chain[chain.length - 1] : undefined;
}

export function backfillCompanyEventChain(
  registry: CompanyEventsRegistry,
  opts?: { force?: boolean }
): { links: number; events: number; registry: CompanyEventsRegistry } {
  const existing = loadCompanyEventChain();
  if (existing.length > 0 && !opts?.force) {
    throw new Error(
      `Chain already has ${existing.length} link(s). Re-run with --force to rebuild.`
    );
  }

  if (existing.length > 0 && opts?.force) {
    writeFileSync(CHAIN_PATH(), "", "utf8");
  }

  const sorted = [...registry.events].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );

  let links = 0;
  const seqByEventId = new Map<string, number>();
  for (const event of sorted) {
    const link = appendChainLink({
      action: "create",
      event: {
        id: event.id,
        occurred_at: event.occurred_at,
        kind: event.kind,
        title: event.title,
        status: event.status === "voided" ? "open" : event.status,
      },
    });
    seqByEventId.set(event.id, link.seq);
    links += 1;
  }

  for (const event of registry.events) {
    const seq = seqByEventId.get(event.id);
    if (seq !== undefined) {
      event.chain_seq = seq;
    }
  }
  registry.schema_version = 2;

  return { links, events: sorted.length, registry };
}
