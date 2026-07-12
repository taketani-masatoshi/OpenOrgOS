import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  companyEventChainLinkSchema,
  companyEventChainPayloadSchema,
  type CompanyEventChainCreatePayload,
  type CompanyEventChainLink,
  type CompanyEventChainPayload,
} from "../../schemas/company-events-chain.js";
import {
  companyEventSchema,
  type CompanyEvent,
  type CompanyEventsRegistry,
} from "../../schemas/company-events.js";
import { canonicalJson } from "./protocol/canonical.js";
import { appendJsonl, loadJsonl } from "./jsonl-store.js";
import { getDataDir, toLogicalPath } from "./utils.js";
import { getClock } from "./runtime-context.js";

const CHAIN_GENESIS = "genesis";

const CHAIN_PATH = () => join(getDataDir(), "company-events-chain.jsonl");

/**
 * Storage port for company-event chain (Repository · engineering §3).
 * Default: append-only jsonl under the tenant data dir.
 */
export interface CompanyEventChainRepository {
  loadAll(): CompanyEventChainLink[];
  append(link: CompanyEventChainLink): void;
  /** Empty the chain file (backfill --force only). */
  truncate(): void;
}

function createJsonlCompanyEventChainRepository(): CompanyEventChainRepository {
  return {
    loadAll() {
      return loadJsonl(CHAIN_PATH(), (raw) => companyEventChainLinkSchema.parse(raw));
    },
    append(link) {
      mkdirSync(join(CHAIN_PATH(), ".."), { recursive: true });
      appendJsonl(CHAIN_PATH(), link);
    },
    truncate() {
      mkdirSync(join(CHAIN_PATH(), ".."), { recursive: true });
      writeFileSync(CHAIN_PATH(), "", "utf8");
    },
  };
}

let chainRepository: CompanyEventChainRepository = createJsonlCompanyEventChainRepository();

export function setCompanyEventChainRepository(next: CompanyEventChainRepository): void {
  chainRepository = next;
}

export function resetCompanyEventChainRepository(): void {
  chainRepository = createJsonlCompanyEventChainRepository();
}

export function companyEventChainPath(): string {
  return toLogicalPath(CHAIN_PATH());
}

export function loadCompanyEventChain(): CompanyEventChainLink[] {
  return chainRepository.loadAll();
}

export type ChainPayloadInput = CompanyEventChainPayload;

export function buildChainPayloadDigest(input: ChainPayloadInput): string {
  const payload = companyEventChainPayloadSchema.parse(input);
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function buildLinkDigest(
  prevDigest: string | null,
  link: Omit<CompanyEventChainLink, "digest" | "payload">
): string {
  const seed = prevDigest ?? CHAIN_GENESIS;
  return createHash("sha256")
    .update(seed + canonicalJson(link))
    .digest("hex");
}

function linkFieldsForDigest(
  link: Pick<
    CompanyEventChainLink,
    | "seq"
    | "link_id"
    | "action"
    | "event_id"
    | "target_event_id"
    | "prev_digest"
    | "payload_digest"
    | "recorded_at"
  >
): Omit<CompanyEventChainLink, "digest" | "payload"> {
  return {
    seq: link.seq,
    link_id: link.link_id,
    action: link.action,
    event_id: link.event_id,
    target_event_id: link.target_event_id,
    prev_digest: link.prev_digest,
    payload_digest: link.payload_digest,
    recorded_at: link.recorded_at,
  };
}

export function createPayloadFromEvent(event: CompanyEvent): CompanyEventChainCreatePayload {
  return companyEventChainPayloadSchema.parse({
    action: "create",
    event_id: event.id,
    occurred_at: event.occurred_at,
    kind: event.kind,
    title: event.title,
    status: event.status === "voided" ? "open" : event.status,
    month: event.month,
    event_path: event.event_path,
    artifact_dir: event.artifact_dir,
    created_at: event.created_at,
    related: event.related,
    notes: event.notes,
    target_event_id: event.target_event_id,
    void_reason: event.void_reason,
  }) as CompanyEventChainCreatePayload;
}

export function appendChainLink(input: ChainPayloadInput): CompanyEventChainLink {
  const chain = loadCompanyEventChain();
  const prev = chain.length > 0 ? chain[chain.length - 1] : undefined;
  const seq = (prev?.seq ?? 0) + 1;
  const payload = companyEventChainPayloadSchema.parse(input);
  const payload_digest = buildChainPayloadDigest(payload);
  const event_id = payload.event_id;
  const target_event_id = payload.action === "void" ? payload.target_event_id : undefined;

  const linkSansDigest = linkFieldsForDigest({
    seq,
    link_id: `CEL-${seq}`,
    action: payload.action,
    event_id,
    target_event_id,
    prev_digest: prev?.digest ?? null,
    payload_digest,
    recorded_at: getClock().nowIso(),
  });

  const link = companyEventChainLinkSchema.parse({
    ...linkSansDigest,
    payload,
    digest: buildLinkDigest(prev?.digest ?? null, linkSansDigest),
  });

  chainRepository.append(link);
  return link;
}

export interface ChainVerifyIssue {
  code: string;
  message: string;
  seq?: number;
  event_id?: string;
}

export function verifyCompanyEventChainRecords(chain: CompanyEventChainLink[]): {
  ok: boolean;
  issues: ChainVerifyIssue[];
  checked: number;
} {
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

    const linkSansDigest = linkFieldsForDigest(link);
    const expectedDigest = buildLinkDigest(prevDigest, linkSansDigest);
    if (link.digest !== expectedDigest) {
      issues.push({
        code: "chain-digest-mismatch",
        message: `digest mismatch at seq ${link.seq}`,
        seq: link.seq,
        event_id: link.event_id,
      });
    }

    if (link.payload) {
      const expectedPayloadDigest = buildChainPayloadDigest(link.payload);
      if (link.payload_digest !== expectedPayloadDigest) {
        issues.push({
          code: "chain-payload-digest-mismatch",
          message: `payload_digest mismatch at seq ${link.seq}`,
          seq: link.seq,
          event_id: link.event_id,
        });
      }
      if (link.payload.action !== link.action) {
        issues.push({
          code: "chain-payload-action-mismatch",
          message: `payload.action ${link.payload.action} != link.action ${link.action} at seq ${link.seq}`,
          seq: link.seq,
          event_id: link.event_id,
        });
      }
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

export interface ReduceCompanyEventsResult {
  registry: CompanyEventsRegistry;
  issues: ChainVerifyIssue[];
  /** True when every create link carried a materializable payload. */
  complete: boolean;
}

function eventFromCreatePayload(
  payload: CompanyEventChainCreatePayload,
  chainSeq: number
): CompanyEvent {
  return companyEventSchema.parse({
    id: payload.event_id,
    occurred_at: payload.occurred_at,
    month: payload.month,
    kind: payload.kind,
    title: payload.title,
    status: payload.status,
    event_path: payload.event_path,
    artifact_dir: payload.artifact_dir,
    related: payload.related,
    notes: payload.notes,
    created_at: payload.created_at,
    chain_seq: chainSeq,
    target_event_id: payload.target_event_id,
    void_reason: payload.void_reason,
  });
}

/**
 * Deterministic reducer: chain links → company-events registry.
 * Links without create payload cannot seed an event (legacy); those are reported.
 */
export function reduceCompanyEvents(
  chain: CompanyEventChainLink[],
  opts?: { seed?: CompanyEventsRegistry }
): ReduceCompanyEventsResult {
  const issues: ChainVerifyIssue[] = [];
  const byId = new Map<string, CompanyEvent>();

  if (opts?.seed) {
    for (const event of opts.seed.events) {
      byId.set(event.id, { ...event });
    }
  }

  let complete = true;

  for (const link of chain) {
    if (link.action === "create") {
      if (!link.payload || link.payload.action !== "create") {
        complete = false;
        if (!byId.has(link.event_id)) {
          issues.push({
            code: "chain-create-payload-missing",
            message: `Create link seq ${link.seq} has no payload; cannot materialize ${link.event_id} from chain alone`,
            seq: link.seq,
            event_id: link.event_id,
          });
        } else {
          byId.set(
            link.event_id,
            companyEventSchema.parse({ ...byId.get(link.event_id)!, chain_seq: link.seq })
          );
        }
        continue;
      }
      byId.set(link.event_id, eventFromCreatePayload(link.payload, link.seq));
      continue;
    }

    if (link.action === "status") {
      const current = byId.get(link.event_id);
      if (!current) {
        issues.push({
          code: "chain-status-missing-event",
          message: `Status link seq ${link.seq} references unknown event ${link.event_id}`,
          seq: link.seq,
          event_id: link.event_id,
        });
        continue;
      }
      if (!link.payload || link.payload.action !== "status") {
        complete = false;
        issues.push({
          code: "chain-status-payload-missing",
          message: `Status link seq ${link.seq} missing payload`,
          seq: link.seq,
          event_id: link.event_id,
        });
        continue;
      }
      byId.set(
        link.event_id,
        companyEventSchema.parse({
          ...current,
          status: link.payload.status,
          closed_at: link.payload.closed_at ?? current.closed_at,
        })
      );
      continue;
    }

    if (link.action === "void") {
      if (!link.payload || link.payload.action !== "void") {
        complete = false;
        issues.push({
          code: "chain-void-payload-missing",
          message: `Void link seq ${link.seq} missing payload`,
          seq: link.seq,
          event_id: link.event_id,
        });
        continue;
      }
      const targetId = link.payload.target_event_id;
      const target = byId.get(targetId);
      if (!target) {
        issues.push({
          code: "chain-void-target-missing-reduce",
          message: `Void link seq ${link.seq} targets unknown event ${targetId}`,
          seq: link.seq,
          event_id: targetId,
        });
        continue;
      }
      const voidedAt = link.payload.voided_at ?? target.voided_at;
      byId.set(
        targetId,
        companyEventSchema.parse({
          ...target,
          status: "voided",
          voided_by: link.payload.event_id,
          voided_at: voidedAt,
          void_reason: link.payload.reason,
        })
      );
      continue;
    }

    if (link.action === "wire") {
      if (!link.payload || link.payload.action !== "wire") {
        complete = false;
        issues.push({
          code: "chain-wire-payload-missing",
          message: `Wire link seq ${link.seq} missing payload`,
          seq: link.seq,
          event_id: link.event_id,
        });
        continue;
      }
      const current = byId.get(link.event_id);
      if (!current) {
        issues.push({
          code: "chain-wire-missing-event",
          message: `Wire link seq ${link.seq} references unknown event ${link.event_id}`,
          seq: link.seq,
          event_id: link.event_id,
        });
        continue;
      }
      byId.set(
        link.event_id,
        companyEventSchema.parse({
          ...current,
          wire_binding: {
            ...current.wire_binding,
            ...link.payload.wire_binding,
          },
        })
      );
    }
  }

  const registry: CompanyEventsRegistry = {
    schema_version: 2,
    events: [...byId.values()].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    ),
  };

  return { registry, issues, complete: complete && issues.length === 0 };
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

  // When reduce is complete, registry should match reduced state.
  const reduced = reduceCompanyEvents(chain, { seed: registry });
  if (reduced.complete) {
    const reducedById = new Map(reduced.registry.events.map((e) => [e.id, e]));
    for (const event of registry.events) {
      const fromChain = reducedById.get(event.id);
      if (!fromChain) continue;
      if (event.status !== fromChain.status) {
        issues.push({
          code: "chain-status-drift",
          message: `Event ${event.id} registry status ${event.status} != chain-reduced ${fromChain.status}`,
          event_id: event.id,
        });
      }
    }
  }

  return issues;
}

export function validateCompanyEventChainWithRegistry(registry: CompanyEventsRegistry): {
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
    chainRepository.truncate();
  }

  const sorted = [...registry.events].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );

  let links = 0;
  const seqByEventId = new Map<string, number>();
  for (const event of sorted) {
    const link = appendChainLink(createPayloadFromEvent(event));
    seqByEventId.set(event.id, link.seq);
    links += 1;

    if (event.status === "closed" || event.status === "archived") {
      appendChainLink({
        action: "status",
        event_id: event.id,
        status: event.status,
        closed_at: event.closed_at,
      });
      links += 1;
    }
  }

  // Void links after creates (and status) so targets exist when reducing.
  for (const event of sorted) {
    if (event.status !== "voided" || !event.voided_by) continue;
    appendChainLink({
      action: "void",
      event_id: event.voided_by,
      target_event_id: event.id,
      reason: event.void_reason ?? "backfill",
      voided_at: event.voided_at,
    });
    links += 1;
  }

  for (const event of sorted) {
    if (!event.wire_binding) continue;
    appendChainLink({
      action: "wire",
      event_id: event.id,
      wire_binding: event.wire_binding,
    });
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
