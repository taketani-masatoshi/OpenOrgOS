import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildChainPayloadDigest,
  loadCompanyEventChain,
} from "../company-events-chain.js";
import { getDataDir, getDocsDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

const TRACE_KIND_TO_EVENT = {
  contract: "contract",
  transfer: "finance",
  journal: "finance",
  hr_step: "personnel",
} as const;

const CHAIN_REL = "data/company-events-chain.jsonl";

function loadChainEventIds(): { ids: Set<string>; inputs_ref: string[] } {
  const path = join(getDataDir(), "company-events-chain.jsonl");
  if (!existsSync(path)) return { ids: new Set(), inputs_ref: [] };
  try {
    const links = loadCompanyEventChain();
    return {
      ids: new Set(links.map((link) => link.event_id)),
      inputs_ref: links.length > 0 ? [CHAIN_REL] : [],
    };
  } catch {
    return { ids: new Set(), inputs_ref: [] };
  }
}

function missingRefFor(
  kind: "contract" | "transfer" | "journal" | "hr_step",
  id: string,
  chainIds: Set<string>,
  chainPresent: boolean,
): string | null {
  if (kind === "contract") {
    const path = join(getDataDir(), "contracts", `${id}.yaml`);
    if (existsSync(path)) return null;
    if (chainPresent && chainIds.has(id)) return null;
    return `contract:${id}`;
  }
  if (kind === "journal") {
    if (chainPresent) return chainIds.has(id) ? null : `chain:${id}`;
    const path = join(getDataDir(), "finance", "journal-entries.yaml");
    return existsSync(path) ? null : `journal:${id}`;
  }
  if (chainPresent) {
    return chainIds.has(id) ? null : `chain:${id}`;
  }
  const docsChain = join(getDocsDir(), "company", "events");
  if (!existsSync(docsChain)) return `${kind}:${id}`;
  return `chain:${id}`;
}

export function bridgeEventIndex(
  refs: Array<{ kind: "contract" | "transfer" | "journal" | "hr_step"; id: string }>,
): {
  index: Array<{ kind: string; id: string; digest: string; in_chain: boolean }>;
  missing_refs: string[];
  inputs_ref: string[];
} {
  const chain = loadChainEventIds();
  const missing_refs: string[] = [];
  const inputs_ref = [...chain.inputs_ref];
  const index = refs.map((ref) => {
    const in_chain = chain.ids.has(ref.id);
    const missing = missingRefFor(
      ref.kind,
      ref.id,
      chain.ids,
      chain.inputs_ref.length > 0 || existsSync(join(getDataDir(), "company-events-chain.jsonl")),
    );
    if (missing) missing_refs.push(missing);
    if (ref.kind === "contract") {
      const path = join(getDataDir(), "contracts", `${ref.id}.yaml`);
      if (existsSync(path) && !inputs_ref.includes(`data/contracts/${ref.id}.yaml`)) {
        inputs_ref.push(`data/contracts/${ref.id}.yaml`);
      }
    }
    if (ref.kind === "journal") {
      const path = join(getDataDir(), "finance", "journal-entries.yaml");
      if (existsSync(path) && !inputs_ref.includes("data/finance/journal-entries.yaml")) {
        inputs_ref.push("data/finance/journal-entries.yaml");
      }
    }
    return {
      kind: ref.kind,
      id: ref.id,
      digest: createHash("sha256").update(`${ref.kind}:${ref.id}`).digest("hex"),
      in_chain,
    };
  });
  return { index, missing_refs, inputs_ref };
}

/** Draft whose digest matches a company-event create payload. Does not append the chain. */
export function draftChainEvent(input: {
  kind: "contract" | "transfer" | "journal" | "hr_step";
  id: string;
  occurredAt: string;
}): {
  kind: (typeof TRACE_KIND_TO_EVENT)[typeof input.kind];
  id: string;
  occurredAt: string;
  digest: string;
  wroteChain: false;
} {
  const kind = TRACE_KIND_TO_EVENT[input.kind];
  const digest = buildChainPayloadDigest({
    action: "create",
    event: {
      id: input.id,
      occurred_at: input.occurredAt,
      kind,
      title: input.id,
      status: "open",
    },
  });
  return { kind, id: input.id, occurredAt: input.occurredAt, digest, wroteChain: false };
}

/** One report. Digest index + chain membership — does not append the chain. */
export function renderTraceBridgeReport(
  refs: Array<{ kind: "contract" | "transfer" | "journal" | "hr_step"; id: string }>,
): Record<string, unknown> {
  const bridged = bridgeEventIndex(refs);
  return flattenProposeReport(
    makeProposeReport({
      kind: "trace-bridge-report",
      depth: bridged.inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref: bridged.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        index: bridged.index,
        missing_refs: bridged.missing_refs,
        wroteChain: false,
        singleGiantLog: false,
      },
    }),
  );
}
