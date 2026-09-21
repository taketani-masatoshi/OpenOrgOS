import { createHash } from "node:crypto";
import { buildChainPayloadDigest } from "../company-events-chain.js";

const TRACE_KIND_TO_EVENT = {
  contract: "contract",
  transfer: "finance",
  journal: "finance",
  hr_step: "personnel",
} as const;

export function bridgeEventIndex(
  refs: Array<{ kind: "contract" | "transfer" | "journal" | "hr_step"; id: string }>,
): Array<{ kind: string; id: string; digest: string }> {
  return refs.map((ref) => ({
    kind: ref.kind,
    id: ref.id,
    digest: createHash("sha256").update(`${ref.kind}:${ref.id}`).digest("hex"),
  }));
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
