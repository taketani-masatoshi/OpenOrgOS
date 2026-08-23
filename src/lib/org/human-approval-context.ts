/**
 * HumanApprovalContext — signed, single-use ceremony for final approvals (ADR 0038).
 * Issued only from CLI human sessions or Chat/Wire UI approve buttons. LLM / MCP cannot mint.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import {
  humanApprovalContextSchema,
  type HumanApprovalContext,
  type HumanApprovalSource,
} from "../../../schemas/org/human-approval-context.js";
import { canonicalJson } from "../protocol/canonical.js";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { isProdSecurityMode } from "../console-auth/operator-rbac.js";

const DEFAULT_TTL_MS = 5 * 60_000;

export class HumanApprovalContextError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HumanApprovalContextError";
    this.code = code;
  }
}

function hmacSecret(): Buffer {
  const raw =
    process.env.ORGOS_HUMAN_APPROVAL_SECRET?.trim() ||
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET?.trim() ||
    (isProdSecurityMode() ? "" : "orgos-dev-human-approval");
  if (!raw) {
    throw new HumanApprovalContextError(
      "secret_missing",
      "ORGOS_HUMAN_APPROVAL_SECRET is required to issue or verify HumanApprovalContext",
    );
  }
  return Buffer.from(raw, "utf-8");
}

export function humanApprovalSubjectDigest(approval: OrgApprovalRequest): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        approval_id: approval.approval_id,
        subject_type: approval.subject_type,
        subject_ref: approval.subject_ref ?? null,
        proposed_by: approval.proposed_by,
        amount: approval.amount ?? null,
        wire: approval.wire
          ? {
              peer_id: approval.wire.peer_id,
              transaction_type: approval.wire.transaction_type,
              contract_id: approval.wire.contract_id ?? null,
            }
          : null,
      }),
    )
    .digest("hex");
}

function unsignedPayload(ctx: Omit<HumanApprovalContext, "signature">): string {
  return canonicalJson(ctx);
}

function signContext(ctx: Omit<HumanApprovalContext, "signature">): string {
  return createHmac("sha256", hmacSecret()).update(unsignedPayload(ctx)).digest("base64url");
}

function signaturesMatch(expected: string, got: string): boolean {
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(got, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function consumedStorePath(): string {
  const fromEnv = process.env.ORGOS_HUMAN_APPROVAL_STORE?.trim();
  if (fromEnv) return fromEnv;
  return join(getWorkspaceRoot(), ".orgos", "human-approval-consumed.json");
}

type ConsumedFile = { version: 1; ids: string[] };

function readConsumed(): Set<string> {
  const path = consumedStorePath();
  if (!existsSync(path)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ConsumedFile;
    if (parsed.version === 1 && Array.isArray(parsed.ids)) return new Set(parsed.ids);
  } catch {
    /* rebuild */
  }
  return new Set();
}

function writeConsumed(ids: Set<string>): void {
  const path = consumedStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const keep = [...ids].slice(-500);
  writeFileSync(path, JSON.stringify({ version: 1, ids: keep }, null, 2), "utf8");
}

export function issueHumanApprovalContext(opts: {
  approval: OrgApprovalRequest;
  operatorId: string;
  source: HumanApprovalSource;
  ttlMs?: number;
}): HumanApprovalContext {
  const operatorId = opts.operatorId.trim();
  if (!operatorId) {
    throw new HumanApprovalContextError("operator_required", "operatorId is required to issue HumanApprovalContext");
  }
  const now = Date.now();
  const unsigned: Omit<HumanApprovalContext, "signature"> = {
    version: 1,
    context_id: `HAC-${randomBytes(8).toString("hex")}`,
    approval_id: opts.approval.approval_id,
    operator_id: operatorId,
    source: opts.source,
    nonce: randomBytes(16).toString("hex"),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + (opts.ttlMs ?? DEFAULT_TTL_MS)).toISOString(),
    subject_digest: humanApprovalSubjectDigest(opts.approval),
  };
  return humanApprovalContextSchema.parse({
    ...unsigned,
    signature: signContext(unsigned),
  });
}

export function assertHumanApprovalContext(opts: {
  context: HumanApprovalContext | undefined;
  approval: OrgApprovalRequest;
  operatorId: string;
}): HumanApprovalContext {
  if (!opts.context) {
    throw new HumanApprovalContextError(
      "context_required",
      `Approval ${opts.approval.approval_id} requires HumanApprovalContext from Chat/Wire UI or CLI human session`,
    );
  }
  const ctx = humanApprovalContextSchema.parse(opts.context);
  const { signature, ...unsigned } = ctx;
  if (!signaturesMatch(signContext(unsigned), signature)) {
    throw new HumanApprovalContextError("signature_mismatch", "HumanApprovalContext signature is invalid");
  }
  if (ctx.approval_id !== opts.approval.approval_id) {
    throw new HumanApprovalContextError("approval_mismatch", "HumanApprovalContext approval_id does not match");
  }
  if (ctx.operator_id !== opts.operatorId.trim()) {
    throw new HumanApprovalContextError(
      "operator_mismatch",
      "HumanApprovalContext operator_id does not match the authenticated operator",
    );
  }
  if (Date.parse(ctx.expires_at) <= Date.now()) {
    throw new HumanApprovalContextError("expired", "HumanApprovalContext has expired");
  }
  const expectedDigest = humanApprovalSubjectDigest(opts.approval);
  if (ctx.subject_digest !== expectedDigest) {
    throw new HumanApprovalContextError(
      "digest_mismatch",
      "HumanApprovalContext subject digest does not match the pending approval",
    );
  }
  const consumed = readConsumed();
  if (consumed.has(ctx.context_id)) {
    throw new HumanApprovalContextError("replay", "HumanApprovalContext has already been consumed");
  }
  consumed.add(ctx.context_id);
  writeConsumed(consumed);
  return ctx;
}
