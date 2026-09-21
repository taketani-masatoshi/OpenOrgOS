import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildChainPayloadDigest } from "../company-events-chain.js";
import { getDataDir, getDocsDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

const TRACE_KIND_TO_EVENT = {
  contract: "contract",
  transfer: "finance",
  journal: "finance",
  hr_step: "personnel",
} as const;

function missingRefFor(
  kind: "contract" | "transfer" | "journal" | "hr_step",
  id: string,
): string | null {
  if (kind === "contract") {
    const path = join(getDataDir(), "contracts", `${id}.yaml`);
    return existsSync(path) ? null : `contract:${id}`;
  }
  if (kind === "journal") {
    const path = join(getDataDir(), "finance", "journal-entries.yaml");
    return existsSync(path) ? null : `journal:${id}`;
  }
  const chain = join(getDataDir(), "company-events-chain.jsonl");
  if (!existsSync(chain)) {
    const docsChain = join(getDocsDir(), "company", "events");
    if (!existsSync(docsChain)) return `${kind}:${id}`;
  }
  return null;
}

export function bridgeEventIndex(
  refs: Array<{ kind: "contract" | "transfer" | "journal" | "hr_step"; id: string }>,
): {
  index: Array<{ kind: string; id: string; digest: string }>;
  missing_refs: string[];
} {
  const missing_refs: string[] = [];
  const index = refs.map((ref) => {
    const missing = missingRefFor(ref.kind, ref.id);
    if (missing) missing_refs.push(missing);
    return {
      kind: ref.kind,
      id: ref.id,
      digest: createHash("sha256").update(`${ref.kind}:${ref.id}`).digest("hex"),
    };
  });
  return { index, missing_refs };
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

/** One report. Digest index only — does not append the chain or build one giant log. */
export function renderTraceBridgeReport(
  refs: Array<{ kind: "contract" | "transfer" | "journal" | "hr_step"; id: string }>,
): Record<string, unknown> {
  const bridged = bridgeEventIndex(refs);
  return flattenProposeReport(
    makeProposeReport({
      kind: "trace-bridge-report",
      depth: "L1",
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
