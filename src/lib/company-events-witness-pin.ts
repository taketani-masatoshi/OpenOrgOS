import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  companyEventsWitnessPinSchema,
  type CompanyEventsWitnessPin,
} from "../../schemas/company-events-witness-pin.js";
import { getCompanyEventChainTail, loadCompanyEventChain } from "./company-events-chain.js";
import { getDataDir, readYamlFile, writeYamlFile } from "./utils.js";
import { runWithEventsWriteGuard } from "./company-events-write-guard.js";
import { appendProtocolAuditRecord } from "./protocol/audit-chain.js";
import { maybeSignEnvelope } from "./protocol/signing.js";
import { ourOrgRef } from "./protocol/identity.js";
import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "../../schemas/protocol/org-event.js";
import { getClock } from "./runtime-context.js";

export function companyEventsWitnessPinPath(): string {
  return join(getDataDir(), "company-events-witness-pin.yaml");
}

export function loadCompanyEventsWitnessPin(): CompanyEventsWitnessPin | undefined {
  const path = companyEventsWitnessPinPath();
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, companyEventsWitnessPinSchema);
}

function buildPinEnvelope(pin: CompanyEventsWitnessPin): EventEnvelope {
  const now = getClock().nowIso();
  return {
    protocol_version: "1",
    event_id: pin.event_id ?? randomUUID(),
    occurred_at: now,
    origin: ourOrgRef(),
    identity: { org_ref: ourOrgRef() },
    event: {
      type: "org.audit.attested",
      payload: {
        kind: "company_events.chain.pinned",
        chain_tail_digest: pin.chain_tail_digest,
        chain_tail_seq: pin.chain_tail_seq,
        hub_id: pin.hub_id ?? "local-pin",
      },
    },
    signature: null,
  };
}

export function pinCompanyEventChainTail(opts?: { hubId?: string }): CompanyEventsWitnessPin {
  const tail = getCompanyEventChainTail();
  if (!tail) {
    throw new Error("Company event chain is empty — nothing to pin");
  }
  const pin = companyEventsWitnessPinSchema.parse({
    version: 1,
    pinned_at: getClock().nowIso(),
    chain_tail_seq: tail.seq,
    chain_tail_digest: tail.digest,
    chain_tail_link_id: tail.link_id,
    hub_id: opts?.hubId ?? "local-pin",
    event_id: randomUUID(),
  });
  runWithEventsWriteGuard("events chain pin", () => {
    writeYamlFile(companyEventsWitnessPinPath(), pin);
  });
  try {
    const envelope = maybeSignEnvelope(buildPinEnvelope(pin));
    appendProtocolAuditRecord({ envelope });
  } catch {
    /* pin file is the local fixity point even if protocol audit is unavailable */
  }
  return pin;
}

export function verifyCompanyEventsWitnessPin(opts?: {
  chain?: ReturnType<typeof loadCompanyEventChain>;
  requireTail?: boolean;
  maxLagLinks?: number;
}): {
  ok: boolean;
  code?: string;
  message?: string;
  pin?: CompanyEventsWitnessPin;
  lag_links?: number;
} {
  const pin = loadCompanyEventsWitnessPin();
  const chain = opts?.chain ?? loadCompanyEventChain();
  const tail = chain.length > 0 ? chain[chain.length - 1] : undefined;

  if (!pin) {
    if (opts?.requireTail && tail) {
      return {
        ok: false,
        code: "witness-pin-absent",
        message: "Witness pin is required but not configured",
      };
    }
    return { ok: true };
  }

  if (!tail) {
    return {
      ok: false,
      code: "witness-pin-missing-chain",
      message: "Witness pin exists but the company event chain is empty",
      pin,
    };
  }

  const pinned = chain.find((link) => link.seq === pin.chain_tail_seq);
  if (!pinned || pinned.digest !== pin.chain_tail_digest) {
    return {
      ok: false,
      code: "witness-pin-mismatch",
      message: `Witness pin digest ${pin.chain_tail_digest} (seq ${pin.chain_tail_seq}) does not match the chain`,
      pin,
    };
  }

  const lagLinks = tail.seq - pin.chain_tail_seq;
  if (opts?.requireTail && lagLinks > 0) {
    return {
      ok: false,
      code: "witness-pin-stale",
      message: `Witness pin is ${lagLinks} link(s) behind chain tail (seq ${tail.seq})`,
      pin,
      lag_links: lagLinks,
    };
  }

  if (opts?.maxLagLinks !== undefined && lagLinks > opts.maxLagLinks) {
    return {
      ok: false,
      code: "witness-pin-stale",
      message: `Witness pin lag ${lagLinks} exceeds max ${opts.maxLagLinks}`,
      pin,
      lag_links: lagLinks,
    };
  }

  return { ok: true, pin, lag_links: lagLinks };
}
